import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCube } from '../contexts/CubeContext.js'
import { CardImageURL } from '../utils/Utils.js'
import { ColorImages } from '../utils/Colors.js'
import {
  useAllMemberships,
  whyLinked,
  saveDesignMap,
  cleanWires,
  ruleColor,
  GroupEditModal,
  LinkEditModal,
} from './DesignMap.js'

// Propagate a group rename through every wire end of a link.
function renameInLink(link, oldName, newName) {
  return {
    ...link,
    wires: (link.wires || []).map(w => ({
      sources: (w.sources || []).map(s => s === oldName ? newName : s),
      targets: (w.targets || []).map(t => t === oldName ? newName : t),
    })),
  }
}

// DesignEditorPage is the workbench for the design rulebook. Three panes:
// a registry of every group and link (browse, create, spot problems), a detail
// pane for whatever's selected (group roster, link wiring, card-vs-card compare,
// or the audit board), and a card lens showing any card's memberships and links.
// Selection lives in the URL (card, vs, view) so any state is shareable.
export function DesignEditorPage() {
  const cube = useCube()
  const [params, setParams] = useSearchParams()
  const focal = params.get('card') || ''
  const vs = params.get('vs') || ''
  const view = params.get('view') || ''

  // The design graph, refetched after each save so edits show immediately.
  const [data, setData] = useState(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let alive = true
    fetch(`/api/${cube}/stats/design-graph`)
      .then(r => r.json())
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({}) })
    return () => { alive = false }
  }, [cube, refresh])
  const refetch = () => setRefresh(r => r + 1)

  const nodes = data?.nodes || []
  const groups = data?.groups || []
  const links = data?.links || []
  const edges = data?.edges || []
  const groupNodes = data?.group_nodes || []

  // name -> [{ group, conds }] : which groups each card is in, and via which conditions.
  const cardGroups = useAllMemberships(cube, groups)
  const membershipsLoading = groups.length > 0 && Object.keys(cardGroups).length === 0

  const nodeByName = useMemo(() => Object.fromEntries(nodes.map(n => [n.name, n])), [nodes])
  const names = useMemo(() => nodes.map(n => n.name).sort(), [nodes])
  const groupIndex = useMemo(() => Object.fromEntries(groups.map((g, i) => [g.name, i])), [groups])
  const linkIndex = useMemo(() => Object.fromEntries(links.map((l, i) => [l.label, i])), [links])
  const linkByLabel = useMemo(() => Object.fromEntries(links.map(l => [l.label, l])), [links])
  const groupNames = useMemo(() => groups.map(g => g.name), [groups])
  const groupCards = useMemo(() => Object.fromEntries(groupNodes.map(g => [g.name, g])), [groupNodes])

  // label -> number of card-to-card edges that link creates.
  const linkEdgeCounts = useMemo(() => {
    const m = {}
    for (const e of edges) for (const l of (e.rule_labels || [])) m[l] = (m[l] || 0) + 1
    return m
  }, [edges])

  // name -> [{ name, labels }] : every card a card links to, with the rules why.
  const neighborsOf = useMemo(() => {
    const m = {}
    const add = (a, b, labels) => { (m[a] = m[a] || []).push({ name: b, labels: labels || [] }) }
    for (const e of edges) {
      add(e.source, e.target, e.rule_labels)
      add(e.target, e.source, e.rule_labels)
    }
    return m
  }, [edges])

  // Systematic health checks over the rulebook. Structural issues (definitionally
  // wrong) feed the registry badge; coverage lists (judgment calls) only show on
  // the audit board.
  const audit = useMemo(() => {
    const groupSet = new Set(groupNames)
    const referenced = new Set()
    const brokenLinks = []
    for (const l of links) {
      const wires = l.wires || []
      const ends = wires.flatMap(w => [...(w.sources || []), ...(w.targets || [])])
      ends.forEach(n => referenced.add(n))
      const missing = ends.filter(n => !groupSet.has(n))
      const oneSided = wires.some(w => !(w.sources || []).length || !(w.targets || []).length)
      if (missing.length || !wires.length || oneSided) {
        brokenLinks.push({ label: l.label, missing })
      }
    }
    // The same group pair wired by more than one link — the edges are identical,
    // so it's usually two rules that drifted into overlap. Direction ignored:
    // A->B and B->A produce the same card edges.
    const pairLinks = {}
    for (const l of links) {
      for (const w of (l.wires || [])) {
        for (const s of (w.sources || [])) {
          for (const t of (w.targets || [])) {
            const key = [s, t].sort().join('|')
            ;(pairLinks[key] = pairLinks[key] || new Set()).add(l.label)
          }
        }
      }
    }
    const duplicatePairs = Object.entries(pairLinks)
      .filter(([, labels]) => labels.size > 1)
      .map(([key, labels]) => ({ key, groups: key.split('|'), labels: [...labels].sort() }))
      .sort((a, b) => a.key.localeCompare(b.key))
    // Two groups whose memberships nearly coincide — usually the same idea
    // captured twice by slightly different queries. Jaccard >= 0.75 keeps
    // deliberate thematic overlap (~50%) out of the list.
    const memberSets = groupNames.map(n => [n, new Set(groupCards[n]?.cards || [])])
    const similarGroups = []
    for (let i = 0; i < memberSets.length; i++) {
      const [an, as] = memberSets[i]
      if (as.size === 0) continue
      for (let j = i + 1; j < memberSets.length; j++) {
        const [bn, bs] = memberSets[j]
        if (bs.size === 0) continue
        let shared = 0
        for (const c of as) if (bs.has(c)) shared++
        const jaccard = shared / (as.size + bs.size - shared)
        if (jaccard >= 0.75) similarGroups.push({ a: an, b: bn, shared, pct: Math.round(jaccard * 100) })
      }
    }
    similarGroups.sort((x, y) => y.pct - x.pct)
    const unlinkedGroups = groupNames.filter(n => !referenced.has(n))
    const emptyGroups = groupNames.filter(n => (groupCards[n]?.card_count ?? (groupCards[n]?.cards || []).length) === 0)
    const ungroupedCards = membershipsLoading ? null : names.filter(n => !(cardGroups[n] || []).length)
    const isolatedCards = membershipsLoading ? null :
      names.filter(n => (cardGroups[n] || []).length > 0 && !(neighborsOf[n] || []).length)
    const structural = brokenLinks.length + unlinkedGroups.length + emptyGroups.length
    return { brokenLinks, duplicatePairs, similarGroups, unlinkedGroups, emptyGroups, ungroupedCards, isolatedCards, structural }
  }, [links, groupNames, groupCards, names, cardGroups, membershipsLoading, neighborsOf])

  const groupWarn = (name) => {
    const empty = audit.emptyGroups.includes(name)
    const unlinked = audit.unlinkedGroups.includes(name)
    if (empty && unlinked) return 'Matches no cards; no link uses it'
    if (empty) return 'Matches no cards'
    if (unlinked) return 'No link uses this group'
    return null
  }
  const linkWarn = (label) => {
    const b = audit.brokenLinks.find(x => x.label === label)
    if (!b) return null
    return b.missing.length ? `References missing group: ${b.missing.join(', ')}` : 'A wire is missing a source or target'
  }

  // --- URL state ---------------------------------------------------------------
  function patchParams(patch) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k) }
    setParams(p, { replace: true })
  }
  const selectView = (v) => patchParams({ view: v })
  const selectGroup = (name) => patchParams({ view: 'g:' + name })
  const selectLink = (label) => patchParams({ view: 'l:' + label })
  const setFocal = (name) => patchParams({ card: name, ...(name ? {} : { vs: '', view: view === 'compare' ? '' : view }) })
  const setVs = (name) => patchParams({ vs: name, view: name ? 'compare' : (view === 'compare' ? '' : view) })
  const swapCards = () => patchParams({ card: vs, vs: focal })

  // Editor state. Each holds { original } - the group/link being edited, or null
  // `original` for a brand-new one.
  const [groupEditor, setGroupEditor] = useState(null)
  const [linkEditor, setLinkEditor] = useState(null)
  const [status, setStatus] = useState('')

  // One hover preview for the whole page, pinned to the viewport corner.
  const [hoverCard, setHoverCard] = useState('')

  // --- save/delete handlers ------------------------------------------------------
  function saveGroup(updated) {
    const conditions = updated.conditions.map(c => c.trim()).filter(Boolean)
    if (conditions.length === 0) { setStatus('At least one condition is required.'); return }
    const newName = updated.name.trim() || 'Untitled group'
    const orig = groupEditor?.original
    let newGroups, newLinks = links
    if (orig) {
      newGroups = groups.map(g => g.name === orig.name ? { name: newName, conditions } : g)
      if (orig.name !== newName) {
        newLinks = links.map(l => renameInLink(l, orig.name, newName))
        if (view === 'g:' + orig.name) selectGroup(newName)
      }
    } else {
      newGroups = [...groups, { name: newName, conditions }]
    }
    saveDesignMap(cube, newGroups, newLinks, refetch, setStatus)
    setGroupEditor(null)
  }

  function saveLink(updated) {
    const wires = cleanWires(updated.wires)
    if (!wires) {
      setStatus('Every wire needs at least one source and one target group.'); return
    }
    const label = updated.label.trim() || 'Untitled link'
    const orig = linkEditor?.original
    const entry = { label, wires }
    const newLinks = orig
      ? links.map(l => l.label === orig.label ? entry : l)
      : [...links, entry]
    if (orig && orig.label !== label && view === 'l:' + orig.label) selectLink(label)
    saveDesignMap(cube, groups, newLinks, refetch, setStatus)
    setLinkEditor(null)
  }

  // Group edits triggered from inside the link editor (by group index).
  const saveGroupByIndex = (idx, updated) => {
    const conditions = updated.conditions.map(c => c.trim()).filter(Boolean)
    if (conditions.length === 0) { setStatus('At least one condition is required.'); return }
    const orig = groups[idx]
    const newName = updated.name.trim() || 'Untitled group'
    const newGroups = groups.map((g, i) => i === idx ? { name: newName, conditions } : g)
    let newLinks = links
    if (orig.name !== newName) {
      newLinks = links.map(l => renameInLink(l, orig.name, newName))
    }
    saveDesignMap(cube, newGroups, newLinks, refetch, setStatus)
    setGroupEditor(null)
  }

  // Deleting a group also removes it from every wire end; a wire left with an
  // empty side shows up on the audit board rather than silently vanishing.
  function deleteGroup(name) {
    const newGroups = groups.filter(g => g.name !== name)
    const newLinks = links.map(l => ({
      ...l,
      wires: (l.wires || []).map(w => ({
        sources: (w.sources || []).filter(s => s !== name),
        targets: (w.targets || []).filter(t => t !== name),
      })),
    }))
    saveDesignMap(cube, newGroups, newLinks, refetch, setStatus)
    if (view === 'g:' + name) selectView('')
  }

  function deleteLink(label) {
    saveDesignMap(cube, groups, links.filter(l => l.label !== label), refetch, setStatus)
    if (view === 'l:' + label) selectView('')
  }

  // Links between the two selected cards, with the "why" bridges.
  const between = useMemo(() => {
    if (!focal || !vs) return []
    return whyLinked(focal, vs, edges, linkByLabel, cardGroups)
  }, [focal, vs, edges, linkByLabel, cardGroups])

  if (!data) {
    return <div className="de-page"><div className="de-loading">Loading design map…</div></div>
  }

  function openGroup(name) {
    const g = groups.find(x => x.name === name)
    if (g) setGroupEditor({ original: g })
  }
  function openLink(label) {
    const l = links.find(x => x.label === label)
    if (l) setLinkEditor({ original: l })
  }

  // Resolve the detail pane from the view param.
  let detail
  if (view.startsWith('g:') && groupIndex[view.slice(2)] !== undefined) {
    const g = groups[groupIndex[view.slice(2)]]
    detail = <GroupDetail
      key={g.name}
      group={g} color={ruleColor(groupIndex[g.name])}
      members={(groupCards[g.name]?.cards || []).slice().sort()}
      cardGroups={cardGroups} nodeByName={nodeByName}
      linksTouching={links.filter(l => (l.wires || []).some(w => (w.sources || []).includes(g.name) || (w.targets || []).includes(g.name)))}
      linkIndex={linkIndex} warn={groupWarn(g.name)}
      onEdit={() => openGroup(g.name)} onDelete={() => deleteGroup(g.name)}
      onSelectLink={selectLink} onFocusCard={setFocal} onHoverCard={setHoverCard}
    />
  } else if (view.startsWith('l:') && linkByLabel[view.slice(2)]) {
    const l = linkByLabel[view.slice(2)]
    detail = <LinkDetail
      key={l.label}
      link={l} color={ruleColor(linkIndex[l.label])}
      edgeCount={linkEdgeCounts[l.label] || 0}
      groupIndex={groupIndex} groupCards={groupCards} warn={linkWarn(l.label)}
      onEdit={() => openLink(l.label)} onDelete={() => deleteLink(l.label)}
      onSelectGroup={selectGroup}
    />
  } else if (view === 'audit') {
    detail = <AuditBoard
      audit={audit} membershipsLoading={membershipsLoading}
      nodeByName={nodeByName} groupIndex={groupIndex} linkIndex={linkIndex}
      onSelectGroup={selectGroup} onSelectLink={selectLink}
      onFocusCard={setFocal} onHoverCard={setHoverCard}
      onReview={() => selectView('review')}
    />
  } else if (view === 'review' && names.length > 0) {
    const current = nodeByName[focal] ? focal : names[0]
    detail = <ReviewDetail
      names={names} card={current} node={nodeByName[current]}
      memberships={(cardGroups[current] || []).slice().sort((a, b) => a.group.localeCompare(b.group))}
      membershipsLoading={membershipsLoading}
      neighbors={neighborsOf[current] || []}
      groupIndex={groupIndex} linkIndex={linkIndex}
      keysEnabled={!groupEditor && !linkEditor}
      onGo={(n) => patchParams({ card: n })}
      onSelectGroup={selectGroup} onSelectLink={selectLink}
    />
  } else if (view === 'compare' && focal && vs) {
    detail = <CompareDetail
      focal={focal} vs={vs} between={between} nodeByName={nodeByName}
      cardGroups={cardGroups} groupIndex={groupIndex} linkIndex={linkIndex}
      onSelectGroup={selectGroup} onSelectLink={selectLink} onEditLink={openLink}
      onSwap={swapCards} onClear={() => setVs('')}
    />
  } else {
    detail = <Overview
      nodes={nodes} groups={groups} links={links} edges={edges}
      audit={audit} membershipsLoading={membershipsLoading} cardGroups={cardGroups}
      onAudit={() => selectView('audit')}
    />
  }

  return (
    <div className={'de-page' + (view === 'review' ? ' de-page-review' : '')}>
      <datalist id="de-card-names">
        {names.map(n => <option key={n} value={n} />)}
      </datalist>

      <Registry
        groups={groups} links={links} view={view}
        groupCards={groupCards} linkEdgeCounts={linkEdgeCounts}
        groupWarn={groupWarn} linkWarn={linkWarn} auditCount={audit.structural}
        compareReady={Boolean(focal && vs)}
        onSelectView={selectView} onSelectGroup={selectGroup} onSelectLink={selectLink}
        onNewGroup={() => setGroupEditor({ original: null })}
        onNewLink={() => setLinkEditor({ original: null })}
      />

      <main className="de-detail">{detail}</main>

      {view !== 'review' && <CardLens
        names={names} focal={focal} vs={vs} node={nodeByName[focal]}
        memberships={(cardGroups[focal] || []).slice().sort((a, b) => a.group.localeCompare(b.group))}
        membershipsLoading={membershipsLoading}
        neighbors={neighborsOf[focal] || []}
        groupIndex={groupIndex} linkIndex={linkIndex}
        onPickFocal={setFocal} onPickVs={setVs}
        onSelectGroup={selectGroup} onSelectLink={selectLink}
        onCompare={() => selectView('compare')} onHoverCard={setHoverCard}
      />}

      {status && <div className="de-status" role="status">{status}</div>}
      {hoverCard && !groupEditor && !linkEditor &&
        <div className="deck-hover-preview"><img src={CardImageURL({ name: hoverCard })} alt={hoverCard} /></div>
      }

      {groupEditor &&
        <GroupEditModal
          group={groupEditor.original || { name: '', conditions: [''] }}
          color={ruleColor(groupEditor.original ? (groupIndex[groupEditor.original.name] ?? 0) : groups.length)}
          onSave={saveGroup}
          onCancel={() => setGroupEditor(null)}
        />
      }
      {linkEditor &&
        <LinkEditModal
          link={linkEditor.original || { label: '', wires: [{ sources: [''], targets: [''] }] }}
          color={ruleColor(linkEditor.original ? (linkIndex[linkEditor.original.label] ?? 0) : links.length)}
          groupNames={groupNames}
          groups={groups}
          onSave={saveLink}
          onCancel={() => setLinkEditor(null)}
          onGroupSaved={saveGroupByIndex}
        />
      }
    </div>
  )
}

// Registry is the left rail: pinned Overview/Audit/Compare rows, then every group
// and link with live counts and warning dots. One filter box narrows both lists.
function Registry({
  groups, links, view, groupCards, linkEdgeCounts, groupWarn, linkWarn, auditCount,
  compareReady, onSelectView, onSelectGroup, onSelectLink, onNewGroup, onNewLink,
}) {
  const [filter, setFilter] = useState('')
  const [closed, setClosed] = useState({})
  const q = filter.trim().toLowerCase()
  const shownGroups = q ? groups.filter(g => g.name.toLowerCase().includes(q)) : groups
  const shownLinks = q ? links.filter(l => l.label.toLowerCase().includes(q)) : links
  const toggle = (key) => setClosed(c => ({ ...c, [key]: !c[key] }))
  const isOpen = (key) => Boolean(q) || !closed[key]

  return (
    <aside className="de-registry">
      <input
        className="de-search" placeholder="Filter groups & links…" value={filter}
        onChange={e => setFilter(e.target.value)} spellCheck={false}
      />

      <div className="de-reg-pinned">
        <button className={'de-row' + (view === '' ? ' de-row-active' : '')} onClick={() => onSelectView('')}>
          <span className="de-row-icon">◈</span>
          <span className="de-row-name">Overview</span>
        </button>
        <button className={'de-row' + (view === 'audit' ? ' de-row-active' : '')} onClick={() => onSelectView('audit')}>
          <span className="de-row-icon">✓</span>
          <span className="de-row-name">Audit</span>
          {auditCount > 0 && <span className="de-badge-warn">{auditCount}</span>}
        </button>
        <button className={'de-row' + (view === 'review' ? ' de-row-active' : '')} onClick={() => onSelectView('review')}>
          <span className="de-row-icon">»</span>
          <span className="de-row-name">Review</span>
        </button>
        {compareReady &&
          <button className={'de-row' + (view === 'compare' ? ' de-row-active' : '')} onClick={() => onSelectView('compare')}>
            <span className="de-row-icon">⇄</span>
            <span className="de-row-name">Compare</span>
          </button>
        }
      </div>

      <div className="de-reg-head" onClick={() => toggle('groups')} role="button" aria-expanded={isOpen('groups')}>
        <span className="de-reg-caret">{isOpen('groups') ? '▾' : '▸'}</span>
        <span>Groups</span>
        <span className="de-reg-count">{groups.length}</span>
        <button className="de-add" onClick={e => { e.stopPropagation(); onNewGroup() }} title="New group">+</button>
      </div>
      {isOpen('groups') && <div className="de-reg-list">
        {shownGroups.map(g => {
          const warn = groupWarn(g.name)
          const active = view === 'g:' + g.name
          const color = ruleColor(groups.indexOf(g))
          return (
            <button
              key={g.name} className={'de-row' + (active ? ' de-row-active' : '')}
              style={active ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
              onClick={() => onSelectGroup(g.name)}
            >
              <span className="dm-swatch" style={{ background: color }} />
              <span className="de-row-name">{g.name}</span>
              {warn && <span className="de-warn-dot" title={warn} />}
              <span className="de-row-count">{groupCards[g.name]?.card_count ?? (groupCards[g.name]?.cards || []).length}</span>
            </button>
          )
        })}
        {shownGroups.length === 0 && <div className="de-muted">No groups match.</div>}
      </div>}

      <div className="de-reg-head" onClick={() => toggle('links')} role="button" aria-expanded={isOpen('links')}>
        <span className="de-reg-caret">{isOpen('links') ? '▾' : '▸'}</span>
        <span>Links</span>
        <span className="de-reg-count">{links.length}</span>
        <button className="de-add" onClick={e => { e.stopPropagation(); onNewLink() }} title="New link">+</button>
      </div>
      {isOpen('links') && <div className="de-reg-list">
        {shownLinks.map(l => {
          const warn = linkWarn(l.label)
          const active = view === 'l:' + l.label
          const color = ruleColor(links.indexOf(l))
          return (
            <button
              key={l.label} className={'de-row' + (active ? ' de-row-active' : '')}
              style={active ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
              onClick={() => onSelectLink(l.label)}
            >
              <span className="dm-swatch de-swatch-link" style={{ background: color }} />
              <span className="de-row-name">{l.label}</span>
              {warn && <span className="de-warn-dot" title={warn} />}
              <span className="de-row-count">{linkEdgeCounts[l.label] || 0}</span>
            </button>
          )
        })}
        {shownLinks.length === 0 && <div className="de-muted">No links match.</div>}
      </div>}
    </aside>
  )
}

// Overview is the resting state of the detail pane: rulebook vitals, group
// coverage, and a pointer at anything the audit flagged.
function Overview({ nodes, groups, links, edges, audit, membershipsLoading, cardGroups, onAudit }) {
  const grouped = membershipsLoading ? null : nodes.filter(n => (cardGroups[n.name] || []).length > 0).length
  const pct = grouped === null || nodes.length === 0 ? 0 : Math.round(100 * grouped / nodes.length)
  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">Design Editor</h3>
      </div>
      <p className="de-lede">
        The rulebook behind the synergy map: <b>groups</b> are card sets defined by query
        conditions, <b>links</b> wire groups together. Pick one on the left, or search a
        card on the right to see where it sits.
      </p>

      <div className="de-vitals">
        <Vital value={nodes.length} label="cards" />
        <Vital value={groups.length} label="groups" />
        <Vital value={links.length} label="links" />
        <Vital value={edges.length} label="card edges" />
      </div>

      <div className="de-subhead">Group coverage</div>
      <div className="de-coverage">
        <div className="de-coverage-bar"><div className="de-coverage-fill" style={{ width: pct + '%' }} /></div>
        <span className="de-coverage-num">
          {grouped === null ? 'measuring…' : `${grouped} of ${nodes.length} cards in at least one group (${pct}%)`}
        </span>
      </div>

      <div className="de-subhead">Health</div>
      {audit.structural === 0 &&
        <div className="de-ok">✓ No structural issues — every group matches cards and is wired to a link.</div>
      }
      {audit.structural > 0 &&
        <button className="de-audit-cta" onClick={onAudit}>
          <span className="de-warn-dot" />
          {audit.structural} structural issue{audit.structural === 1 ? '' : 's'} — open the audit board
        </button>
      }
    </div>
  )
}

function Vital({ value, label }) {
  return (
    <div className="de-vital">
      <span className="de-vital-num">{value}</span>
      <span className="de-vital-label">{label}</span>
    </div>
  )
}

// GroupDetail is the roster review surface: the group's conditions, the links that
// use it, and every member with the condition that pulled it in - hover for the
// card image, so scanning a group for intruders is fast.
function GroupDetail({
  group, color, members, cardGroups, nodeByName, linksTouching, linkIndex, warn,
  onEdit, onDelete, onSelectLink, onFocusCard, onHoverCard,
}) {
  const [confirming, setConfirming] = useState(false)
  const memberConds = (name) => (cardGroups[name] || []).find(m => m.group === group.name)?.conds || []
  const otherCount = (name) => Math.max(0, (cardGroups[name] || []).length - 1)
  return (
    <div className="de-pane" style={{ borderTop: `3px solid ${color}` }}>
      <div className="de-pane-head">
        <span className="dm-swatch dm-swatch-lg" style={{ background: color }} />
        <h3 className="de-pane-title">{group.name}</h3>
        <span className="de-pane-sub">{members.length} card{members.length === 1 ? '' : 's'}</span>
        <span className="de-pane-actions">
          <button className="de-btn" onClick={onEdit}>Edit</button>
          {!confirming && <button className="de-btn de-btn-danger" onClick={() => setConfirming(true)}>Delete</button>}
          {confirming && <>
            <button className="de-btn de-btn-danger" onClick={onDelete}>Confirm delete</button>
            <button className="de-btn" onClick={() => setConfirming(false)}>Keep</button>
          </>}
        </span>
      </div>
      {warn && <div className="de-warn-note">⚠ {warn}</div>}

      <div className="de-subhead">Matches any of</div>
      <div className="de-cond-chips">
        {(group.conditions || []).map((c, i) => <code key={i} className="de-cond">{c}</code>)}
      </div>

      <div className="de-subhead">Wired into {linksTouching.length ? `(${linksTouching.length})` : ''}</div>
      {linksTouching.length === 0 && <div className="de-muted">No links use this group — its cards get no edges from it.</div>}
      {linksTouching.map(l => (
        <button key={l.label} className="de-wire" onClick={() => onSelectLink(l.label)}>
          <span className="dm-swatch" style={{ background: ruleColor(linkIndex[l.label] ?? 0) }} />
          <span className="de-wire-label">{l.label}</span>
          <span className="de-wire-ends">
            {(l.wires || []).filter(w => (w.sources || []).includes(group.name) || (w.targets || []).includes(group.name)).map((w, wi) => (
              <span key={wi} className="de-wire-pair">
                {(w.sources || []).map(s => <Emph key={'s' + s} me={group.name} name={s} />)}
                <span className="de-why-arrow">→</span>
                {(w.targets || []).map(t => <Emph key={'t' + t} me={group.name} name={t} />)}
              </span>
            ))}
          </span>
        </button>
      ))}

      <div className="de-subhead">Members</div>
      {members.length === 0 && <div className="de-muted">No cards match these conditions.</div>}
      <div className="de-roster" onMouseLeave={() => onHoverCard('')}>
        {members.map(name => (
          <button
            key={name} className="de-member"
            onClick={() => onFocusCard(name)}
            onMouseEnter={() => onHoverCard(name)}
            onFocus={() => onHoverCard(name)}
            title="Open in the card lens"
          >
            <span className="de-pips">{ColorImages(nodeByName[name]?.colors)}</span>
            <span className="de-member-name">{name}</span>
            {otherCount(name) > 0 &&
              <span className="de-member-extra" title={(cardGroups[name] || []).filter(m => m.group !== group.name).map(m => m.group).join(', ')}>
                +{otherCount(name)}
              </span>
            }
            <code className="de-member-cond">{memberConds(name).join(' · ')}</code>
          </button>
        ))}
      </div>
    </div>
  )
}

function Emph({ me, name }) {
  return <span className={'de-end' + (name === me ? ' de-end-me' : '')}>{name}</span>
}

// LinkDetail shows one link as a wiring diagram: source groups on the left,
// target groups on the right, one thread per declared wire pair.
function LinkDetail({ link, color, edgeCount, groupIndex, groupCards, warn, onEdit, onDelete, onSelectGroup }) {
  const [confirming, setConfirming] = useState(false)
  const chip = (name) => ({
    key: name,
    color: groupIndex[name] !== undefined ? ruleColor(groupIndex[name]) : 'var(--danger)',
    label: name,
    sub: groupIndex[name] !== undefined
      ? `${groupCards[name]?.card_count ?? (groupCards[name]?.cards || []).length} cards`
      : 'missing group',
    onClick: groupIndex[name] !== undefined ? () => onSelectGroup(name) : undefined,
  })
  const seenLeft = new Set(), seenRight = new Set(), seenThreads = new Set()
  const left = [], right = [], threads = []
  for (const w of (link.wires || [])) {
    for (const s of (w.sources || [])) if (!seenLeft.has(s)) { seenLeft.add(s); left.push(chip(s)) }
    for (const t of (w.targets || [])) if (!seenRight.has(t)) { seenRight.add(t); right.push(chip(t)) }
    for (const s of (w.sources || [])) {
      for (const t of (w.targets || [])) {
        const key = s + '>' + t
        if (!seenThreads.has(key)) { seenThreads.add(key); threads.push({ from: s, to: t, color, key }) }
      }
    }
  }

  return (
    <div className="de-pane" style={{ borderTop: `3px solid ${color}` }}>
      <div className="de-pane-head">
        <span className="dm-swatch dm-swatch-lg" style={{ background: color }} />
        <h3 className="de-pane-title">{link.label}</h3>
        <span className="de-pane-sub">{edgeCount} card edge{edgeCount === 1 ? '' : 's'}</span>
        <span className="de-pane-actions">
          <button className="de-btn" onClick={onEdit}>Edit</button>
          {!confirming && <button className="de-btn de-btn-danger" onClick={() => setConfirming(true)}>Delete</button>}
          {confirming && <>
            <button className="de-btn de-btn-danger" onClick={onDelete}>Confirm delete</button>
            <button className="de-btn" onClick={() => setConfirming(false)}>Keep</button>
          </>}
        </span>
      </div>
      {warn && <div className="de-warn-note">⚠ {warn}</div>}

      <div className="de-loom-labels"><span>Sources</span><span>Targets</span></div>
      <Loom left={left} right={right} threads={threads} />
      <p className="de-muted de-loom-note">
        Within each wire, every card in a source group links to every card in a target group.
      </p>
    </div>
  )
}

// CompareDetail traces the links between two specific cards: the two card images
// flank a loom of the group-to-group bridges that connect them, colored by rule.
function CompareDetail({
  focal, vs, between, nodeByName, cardGroups, groupIndex, linkIndex,
  onSelectGroup, onSelectLink, onEditLink, onSwap, onClear,
}) {
  const chipFor = (name) => ({
    key: name, color: ruleColor(groupIndex[name] ?? 0), label: name,
    onClick: () => onSelectGroup(name),
  })
  const leftSeen = new Set(), rightSeen = new Set()
  const left = [], right = [], threads = []
  for (const r of between) {
    const c = ruleColor(linkIndex[r.label] ?? 0)
    for (const b of r.bridges) {
      if (!leftSeen.has(b.focusGroup)) { leftSeen.add(b.focusGroup); left.push(chipFor(b.focusGroup)) }
      if (!rightSeen.has(b.neighGroup)) { rightSeen.add(b.neighGroup); right.push(chipFor(b.neighGroup)) }
      threads.push({ from: b.focusGroup, to: b.neighGroup, color: c, key: r.label + ':' + b.focusGroup + '>' + b.neighGroup })
    }
  }

  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">Compare</h3>
        <span className="de-pane-sub">{between.length} link{between.length === 1 ? '' : 's'} between</span>
        <span className="de-pane-actions">
          <button className="de-btn" onClick={onSwap}>⇄ Swap</button>
          <button className="de-btn" onClick={onClear}>Clear</button>
        </span>
      </div>

      <div className="de-compare">
        <figure className="de-compare-card">
          <img src={CardImageURL({ name: focal })} alt={focal} />
          <figcaption>{nodeByName[focal] && <span className="de-pips">{ColorImages(nodeByName[focal].colors)}</span>}{focal}</figcaption>
        </figure>
        <div className="de-compare-mid">
          {between.length === 0 && <div className="de-empty">No links between these two cards.</div>}
          {between.length > 0 && <Loom left={left} right={right} threads={threads} />}
        </div>
        <figure className="de-compare-card">
          <img src={CardImageURL({ name: vs })} alt={vs} />
          <figcaption>{nodeByName[vs] && <span className="de-pips">{ColorImages(nodeByName[vs].colors)}</span>}{vs}</figcaption>
        </figure>
      </div>

      {between.map(r => (
        <div key={r.label} className="de-linkgroup">
          <button className="de-wire" onClick={() => onSelectLink(r.label)}>
            <span className="dm-swatch" style={{ background: ruleColor(linkIndex[r.label] ?? 0) }} />
            <span className="de-wire-label">{r.label}</span>
            <span className="de-edit-hint" onClick={e => { e.stopPropagation(); onEditLink(r.label) }}>edit ▸</span>
          </button>
          {r.bridges.map((b, i) => (
            <div key={i} className="de-why">
              <span className="de-why-group">{b.focusGroup}</span>
              {b.focusConds.length > 0 && <code className="de-why-cond">{b.focusConds.join(' · ')}</code>}
              <span className="de-why-arrow">→</span>
              <span className="de-why-group">{b.neighGroup}</span>
              {b.neighConds.length > 0 && <code className="de-why-cond">{b.neighConds.join(' · ')}</code>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// AuditBoard is the systematic pass over the rulebook: structural checks first
// (definitionally wrong), then coverage lists (worth a human look). Every item
// jumps straight to the place you'd fix it.
function AuditBoard({
  audit, membershipsLoading, nodeByName, groupIndex, linkIndex,
  onSelectGroup, onSelectLink, onFocusCard, onHoverCard, onReview,
}) {
  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">Audit</h3>
        <span className="de-pane-sub">
          {audit.structural === 0 ? 'no structural issues' : `${audit.structural} structural issue${audit.structural === 1 ? '' : 's'}`}
        </span>
      </div>

      <button className="de-review-cta" onClick={onReview}>
        <span className="de-review-cta-icon">»</span>
        <span>
          <b>Card-by-card review</b> — step through every card with <kbd>←</kbd> <kbd>→</kbd> and check its groups
        </span>
      </button>

      <AuditSection
        title="Empty groups" count={audit.emptyGroups.length}
        blurb="Conditions match no cards — a stale query or a card that left the cube."
        okMsg="Every group matches at least one card."
      >
        {audit.emptyGroups.map(n => (
          <button key={n} className="de-chip" onClick={() => onSelectGroup(n)}>
            <span className="dm-swatch" style={{ background: ruleColor(groupIndex[n] ?? 0) }} />{n}
          </button>
        ))}
      </AuditSection>

      <AuditSection
        title="Unlinked groups" count={audit.unlinkedGroups.length}
        blurb="No link references these groups, so membership does nothing yet."
        okMsg="Every group is wired into at least one link."
      >
        {audit.unlinkedGroups.map(n => (
          <button key={n} className="de-chip" onClick={() => onSelectGroup(n)}>
            <span className="dm-swatch" style={{ background: ruleColor(groupIndex[n] ?? 0) }} />{n}
          </button>
        ))}
      </AuditSection>

      <AuditSection
        title="Broken links" count={audit.brokenLinks.length}
        blurb="A wire names a group that doesn't exist, or one side of a wire is empty."
        okMsg="Every wire has valid sources and targets."
      >
        {audit.brokenLinks.map(b => (
          <button key={b.label} className="de-chip" onClick={() => onSelectLink(b.label)}>
            <span className="dm-swatch" style={{ background: ruleColor(linkIndex[b.label] ?? 0) }} />
            {b.label}
            <span className="de-chip-sub">{b.missing.length ? `missing: ${b.missing.join(', ')}` : 'empty wire side'}</span>
          </button>
        ))}
      </AuditSection>

      <div className="de-subhead de-audit-divider">Coverage — worth a look, not necessarily wrong</div>

      <AuditSection
        title="Doubled-up links" count={audit.duplicatePairs.length}
        blurb="More than one link wires the same pair of groups — the edges are identical, so one rule may be redundant."
        okMsg="No two links wire the same pair of groups."
      >
        {audit.duplicatePairs.flatMap(d => d.labels.map(label => (
          <button key={d.key + '>' + label} className="de-chip" onClick={() => onSelectLink(label)}>
            <span className="dm-swatch" style={{ background: ruleColor(linkIndex[label] ?? 0) }} />
            {label}
            <span className="de-chip-sub">{d.groups[0]} ↔ {d.groups[1]}</span>
          </button>
        )))}
      </AuditSection>

      <AuditSection
        title="Near-identical groups" count={audit.similarGroups.length}
        blurb="Two groups whose members mostly coincide — likely the same idea captured twice."
        okMsg="No two groups share most of their members."
      >
        {audit.similarGroups.flatMap(s => [s.a, s.b].map(name => (
          <button key={s.a + '>' + s.b + '>' + name} className="de-chip" onClick={() => onSelectGroup(name)}>
            <span className="dm-swatch" style={{ background: ruleColor(groupIndex[name] ?? 0) }} />
            {name}
            <span className="de-chip-sub">{s.pct}% same as {name === s.a ? s.b : s.a}</span>
          </button>
        )))}
      </AuditSection>

      <AuditSection
        title="Ungrouped cards" count={membershipsLoading ? null : audit.ungroupedCards.length}
        blurb="In no group at all — invisible to the synergy map."
        okMsg="Every card is in at least one group."
      >
        {(audit.ungroupedCards || []).map(n => (
          <button
            key={n} className="de-chip"
            onClick={() => onFocusCard(n)}
            onMouseEnter={() => onHoverCard(n)} onMouseLeave={() => onHoverCard('')}
            onFocus={() => onHoverCard(n)} onBlur={() => onHoverCard('')}
          >
            <span className="de-pips">{ColorImages(nodeByName[n]?.colors)}</span>{n}
          </button>
        ))}
      </AuditSection>

      <AuditSection
        title="Isolated cards" count={membershipsLoading ? null : audit.isolatedCards.length}
        blurb="Grouped, but with zero edges — all of their groups are unlinked."
        okMsg="Every grouped card has at least one edge."
      >
        {(audit.isolatedCards || []).map(n => (
          <button
            key={n} className="de-chip"
            onClick={() => onFocusCard(n)}
            onMouseEnter={() => onHoverCard(n)} onMouseLeave={() => onHoverCard('')}
            onFocus={() => onHoverCard(n)} onBlur={() => onHoverCard('')}
          >
            <span className="de-pips">{ColorImages(nodeByName[n]?.colors)}</span>{n}
          </button>
        ))}
      </AuditSection>
    </div>
  )
}

function AuditSection({ title, count, blurb, okMsg, children }) {
  const [open, setOpen] = useState(true)
  const ok = count === 0
  return (
    <section className="de-audit-section">
      <button className="de-audit-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={'de-audit-mark' + (ok ? ' de-audit-ok' : '')}>{ok ? '✓' : count ?? '…'}</span>
        <span className="de-audit-title">{title}</span>
        <span className="de-audit-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && <>
        <p className="de-audit-blurb">{ok ? okMsg : blurb}</p>
        {count === null && <div className="de-muted">Measuring memberships…</div>}
        {!ok && count !== null && <div className="de-chips">{children}</div>}
      </>}
    </section>
  )
}

// ReviewDetail steps through every card in the cube, one per screen, so a full
// membership pass is just holding the right-arrow key. Position rides in the
// card URL param, so a half-finished pass resumes from wherever you left off.
function ReviewDetail({
  names, card, node, memberships, membershipsLoading, neighbors,
  groupIndex, linkIndex, keysEnabled, onGo, onSelectGroup, onSelectLink,
}) {
  const idx = names.indexOf(card)
  const go = (delta) => {
    const next = names[Math.min(names.length - 1, Math.max(0, idx + delta))]
    if (next && next !== card) onGo(next)
  }

  useEffect(() => {
    if (!keysEnabled) return
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // label -> distinct linked-card count, so the link summary reads by-reason.
  const ruleCounts = useMemo(() => {
    const m = {}
    for (const n of neighbors) {
      for (const l of (n.labels.length ? n.labels : ['(unlabeled)'])) {
        (m[l] = m[l] || new Set()).add(n.name)
      }
    }
    return Object.entries(m).map(([label, s]) => [label, s.size]).sort((a, b) => a[0].localeCompare(b[0]))
  }, [neighbors])

  const ungrouped = !membershipsLoading && memberships.length === 0
  const isolated = !ungrouped && !membershipsLoading && neighbors.length === 0

  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">Review</h3>
        <span className="de-pane-sub">{idx + 1} of {names.length}</span>
        <span className="de-pane-actions">
          <span className="de-review-jump">
            <CardSearch key={card} value="" onPick={(n) => n && onGo(n)} names={names} placeholder="Jump to card…" />
          </span>
          <button className="de-btn" onClick={() => go(-1)} disabled={idx === 0}>← Prev</button>
          <button className="de-btn" onClick={() => go(1)} disabled={idx === names.length - 1}>Next →</button>
        </span>
      </div>
      <div className="de-review-progress">
        <div className="de-review-progress-fill" style={{ width: (100 * (idx + 1) / names.length) + '%' }} />
      </div>

      <div className="de-review">
        <img className="de-review-img" src={CardImageURL({ name: card })} alt={card} />
        <div className="de-review-info">
          <div className="de-lens-name">
            {node && <span className="de-pips">{ColorImages(node.colors)}</span>}
            {card}
          </div>
          {ungrouped && <div className="de-warn-note">⚠ In no groups — invisible to the synergy map.</div>}
          {isolated && <div className="de-warn-note">⚠ Grouped, but no edges — all of its groups are unlinked.</div>}

          <div className="de-subhead">In groups {memberships.length ? `(${memberships.length})` : ''}</div>
          {membershipsLoading && <div className="de-muted">Measuring…</div>}
          {memberships.map(m => (
            <button key={m.group} className="de-review-group" onClick={() => onSelectGroup(m.group)}
              style={{ boxShadow: `inset 3px 0 0 ${ruleColor(groupIndex[m.group] ?? 0)}` }}>
              <span className="de-review-group-name">{m.group}</span>
              <code className="de-conds">{(m.conds || []).join(' · ')}</code>
            </button>
          ))}

          <div className="de-subhead">Linked cards {neighbors.length ? `(${new Set(neighbors.map(n => n.name)).size})` : ''}</div>
          {!membershipsLoading && ruleCounts.length === 0 && !ungrouped && <div className="de-muted">No links from this card.</div>}
          <div className="de-chips de-review-rules">
            {ruleCounts.map(([label, count]) => (
              <button key={label} className="de-chip" onClick={() => onSelectLink(label)}>
                <span className="dm-swatch" style={{ background: ruleColor(linkIndex[label] ?? 0) }} />
                {label}
                <span className="de-chip-count">{count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="de-review-hint">
        <kbd>←</kbd> previous · <kbd>→</kbd> next — position is saved in the URL, come back anytime.
      </div>
    </div>
  )
}

// CardLens is the right rail: pick any card and see its image, which groups hold
// it (and via which condition), and every card it links to, grouped by rule.
function CardLens({
  names, focal, vs, node, memberships, membershipsLoading, neighbors, groupIndex, linkIndex,
  onPickFocal, onPickVs, onSelectGroup, onSelectLink, onCompare, onHoverCard,
}) {
  // Bucket the neighbors by rule label so linked cards read by-reason.
  const byLabel = useMemo(() => {
    const m = {}
    for (const n of neighbors) {
      for (const l of (n.labels.length ? n.labels : ['(unlabeled)'])) {
        (m[l] = m[l] || []).push(n.name)
      }
    }
    return Object.entries(m)
      .map(([label, cards]) => [label, [...new Set(cards)].sort()])
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [neighbors])

  return (
    <aside className="de-lens">
      <CardSearch value={focal} onPick={onPickFocal} names={names} placeholder="Search a card…" />
      {!focal && <div className="de-empty">Search a card to inspect its groups and links.</div>}
      {focal && <>
        <img className="de-lens-img" src={CardImageURL({ name: focal })} alt={focal} />
        <div className="de-lens-name">
          {node && <span className="de-pips">{ColorImages(node.colors)}</span>}
          {focal}
        </div>

        <div className="de-subhead">In groups {memberships.length ? `(${memberships.length})` : ''}</div>
        {membershipsLoading && <div className="de-muted">Measuring…</div>}
        {!membershipsLoading && memberships.length === 0 && <div className="de-muted">Not in any group.</div>}
        {memberships.map(m => (
          <button key={m.group} className="de-lens-group" onClick={() => onSelectGroup(m.group)}
            style={{ boxShadow: `inset 3px 0 0 ${ruleColor(groupIndex[m.group] ?? 0)}` }}>
            <span className="de-lens-group-name">{m.group}</span>
            <code className="de-conds">{(m.conds || []).join(' · ')}</code>
          </button>
        ))}

        <div className="de-subhead">Linked cards {neighbors.length ? `(${new Set(neighbors.map(n => n.name)).size})` : ''}</div>
        {byLabel.length === 0 && <div className="de-muted">No links from this card.</div>}
        <div className="de-lens-links" onMouseLeave={() => onHoverCard('')}>
          {byLabel.map(([label, cards]) => (
            <div key={label} className="de-lens-rule" style={{ borderLeft: `3px solid ${ruleColor(linkIndex[label] ?? 0)}` }}>
              <button className="de-lens-rule-label" onClick={() => onSelectLink(label)}>{label}</button>
              {cards.map(c => (
                <button
                  key={c} className="de-lens-linked"
                  onClick={() => onPickVs(c)}
                  onMouseEnter={() => onHoverCard(c)} onFocus={() => onHoverCard(c)}
                  title="Compare with this card"
                >{c}</button>
              ))}
            </div>
          ))}
        </div>

        <div className="de-subhead">Compare</div>
        <CardSearch value={vs} onPick={onPickVs} names={names} placeholder="Compare with another card…" />
        {focal && vs && <button className="de-btn de-compare-btn" onClick={onCompare}>View links between ⇄</button>}
      </>}
    </aside>
  )
}

// Loom draws group chips in two columns with SVG threads connecting them - the
// wiring-diagram view of a link. Thread endpoints are measured from the rendered
// chips, so it survives wrapping and resizes.
function Loom({ left, right, threads }) {
  const wrapRef = useRef(null)
  const chipRefs = useRef({})
  const [paths, setPaths] = useState([])
  const depKey = left.map(c => c.key).join('|') + '::' + right.map(c => c.key).join('|') + '::' + threads.map(t => t.key + t.color).join('|')

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const compute = () => {
      const wr = wrap.getBoundingClientRect()
      const out = []
      for (const t of threads) {
        const a = chipRefs.current['L:' + t.from]
        const b = chipRefs.current['R:' + t.to]
        if (!a || !b) continue
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect()
        const x1 = ar.right - wr.left, y1 = ar.top + ar.height / 2 - wr.top
        const x2 = br.left - wr.left, y2 = br.top + br.height / 2 - wr.top
        const mx = (x1 + x2) / 2
        out.push({ key: t.key, color: t.color, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` })
      }
      setPaths(out)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [depKey])

  const chipEl = (side) => (c) => {
    const Tag = c.onClick ? 'button' : 'span'
    return (
      <Tag
        key={c.key} className="de-loom-chip" onClick={c.onClick}
        ref={el => { if (el) chipRefs.current[side + ':' + c.key] = el; else delete chipRefs.current[side + ':' + c.key] }}
      >
        <span className="dm-swatch" style={{ background: c.color }} />
        <span className="de-loom-chip-name">{c.label}</span>
        {c.sub && <span className="de-loom-chip-sub">{c.sub}</span>}
      </Tag>
    )
  }

  return (
    <div className="de-loom" ref={wrapRef}>
      <div className="de-loom-col">{left.map(chipEl('L'))}</div>
      <div className="de-loom-col de-loom-col-right">{right.map(chipEl('R'))}</div>
      <svg className="de-loom-svg" aria-hidden="true">
        {paths.map(p => <path key={p.key} d={p.d} stroke={p.color} className="de-thread" />)}
      </svg>
    </div>
  )
}

// CardSearch is a name-autocomplete input backed by the shared <datalist>. It only
// commits a pick when the typed text exactly matches a known card (so partial typing
// doesn't write junk to the URL); clearing the box clears the selection.
function CardSearch({ value, onPick, names, placeholder }) {
  const [text, setText] = useState(value || '')
  const nameSet = useMemo(() => new Set(names), [names])
  useEffect(() => { setText(value || '') }, [value])
  return (
    <input
      className="de-search"
      list="de-card-names"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const v = e.target.value
        setText(v)
        if (v === '') onPick('')
        else if (nameSet.has(v)) onPick(v)
      }}
      spellCheck={false}
    />
  )
}
