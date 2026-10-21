// The Rules editor page: loads the rulebook, works out its audit, keeps the
// selection in the URL, and saves edits. The panes live in the other files here.

import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '@mantine/core'
import { useCube } from '../../contexts/CubeContext.js'
import { CardImageURL } from '../../utils/Utils.js'
import { useAllMemberships, whyLinked, saveDesignMap, cleanWires } from '../map/designData.js'
import { ruleColor } from '../map/ruleColors.js'
import { GroupEditModal } from '../map/GroupEditModal.js'
import { LinkEditModal } from '../map/LinkEditModal.js'
import { useCubeWritable } from '../../utils/useCubeWritable.js'
import { renameInLink, withExclude } from "./rulebookEdits.js"
import { auditRulebook, groupWarning, linkWarning } from "./rulebookAudit.js"
import { EditorToolbar } from "./EditorToolbar.js"
import { GroupDetail } from "./GroupDetail.js"
import { LinkDetail } from "./LinkDetail.js"
import { AuditBoard } from "./AuditBoard.js"
import { ReviewDetail } from "./ReviewDetail.js"
import { CompareDetail } from "./CompareDetail.js"
import { Overview } from "./Overview.js"
import { Registry } from "./Registry.js"
import { CardLens } from "./CardLens.js"
import { RULES_COPY } from "./copy.js"
import "../../components/kit/popover.css"
import "./rules.css"
import "../../decks/decks.css"

// DesignEditorPage is the workbench for the design rulebook. Three panes:
// a registry of every group and link (browse, create, spot problems), a detail
// pane for whatever's selected (group roster, link wiring, card-vs-card compare,
// or the audit board), and a card lens showing any card's memberships and links.
// Selection lives in the URL (card, vs, view) so any state is shareable.
export function DesignEditorPage() {
  const cube = useCube()
  const writable = useCubeWritable(cube)
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
  const allEdges = data?.edges || []
  const groupNodes = data?.group_nodes || []

  // Edges can reach cards cut from the cube - the graph widens its edge set so
  // old decks still render cut cards. The editor is a cube-only design view, so
  // drop any edge touching a card that isn't a cube node.
  const edges = useMemo(() => {
    const inCube = new Set(nodes.map(n => n.name))
    return allEdges.filter(e => inCube.has(e.source) && inCube.has(e.target))
  }, [allEdges, nodes])

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
  const audit = useMemo(
    () => auditRulebook({ links, groups, groupNames, groupCards, names, cardGroups, membershipsLoading, neighborsOf }),
    [links, groups, groupNames, groupCards, names, cardGroups, membershipsLoading, neighborsOf],
  )

  const groupWarn = (name) => groupWarning(audit, name)
  const linkWarn = (label) => linkWarning(audit, label)

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
    if (conditions.length === 0) { setStatus(RULES_COPY.page.conditionRequired); return }
    // copy-ok: name saved to the rules file
    const newName = updated.name.trim() || 'Untitled group'
    const entry = withExclude({ name: newName, conditions }, (updated.exclude || []).filter(Boolean))
    const orig = groupEditor?.original
    let newGroups, newLinks = links
    if (orig) {
      newGroups = groups.map(g => g.name === orig.name ? entry : g)
      if (orig.name !== newName) {
        newLinks = links.map(l => renameInLink(l, orig.name, newName))
        if (view === 'g:' + orig.name) selectGroup(newName)
      }
    } else {
      newGroups = [...groups, entry]
    }
    saveDesignMap(cube, newGroups, newLinks, refetch, setStatus)
    setGroupEditor(null)
  }

  function saveLink(updated) {
    const wires = cleanWires(updated.wires)
    if (!wires) {
      setStatus(RULES_COPY.page.wireNeedsEnds); return
    }
    // copy-ok: name saved to the rules file
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
    if (conditions.length === 0) { setStatus(RULES_COPY.page.conditionRequired); return }
    const orig = groups[idx]
    // copy-ok: name saved to the rules file
    const newName = updated.name.trim() || 'Untitled group'
    const entry = withExclude({ name: newName, conditions }, (updated.exclude || []).filter(Boolean))
    const newGroups = groups.map((g, i) => i === idx ? entry : g)
    let newLinks = links
    if (orig.name !== newName) {
      newLinks = links.map(l => renameInLink(l, orig.name, newName))
    }
    saveDesignMap(cube, newGroups, newLinks, refetch, setStatus)
    setGroupEditor(null)
  }

  // One-click hole-poking from the group roster: add or remove a card on the
  // group's exclude list and save immediately.
  function setCardExcluded(groupName, cardName, excluded) {
    const g = groups.find(x => x.name === groupName)
    if (!g) return
    const exclude = excluded
      ? [...(g.exclude || []).filter(n => n !== cardName), cardName]
      : (g.exclude || []).filter(n => n !== cardName)
    const newGroups = groups.map(x => x.name === groupName ? withExclude(x, exclude) : x)
    saveDesignMap(cube, newGroups, links, refetch, setStatus)
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

  // Edit controls only show once the server says the cube is writable; the
  // read-only notice waits for it to say it isn't, so it doesn't flash on load.
  const canEdit = writable === true

  const toolbar = (
    <EditorToolbar
      view={view} auditCount={data ? audit.structural : 0}
      compareReady={Boolean(focal && vs)} onSelectView={selectView}
    />
  )

  if (!data) {
    return <>
      {toolbar}
      <div className="de-page"><div className="de-loading">{RULES_COPY.page.loading}</div></div>
    </>
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
      excluded={(groupCards[g.name]?.excluded_cards || []).slice().sort()}
      cardGroups={cardGroups} nodeByName={nodeByName}
      linksTouching={links.filter(l => (l.wires || []).some(w => (w.sources || []).includes(g.name) || (w.targets || []).includes(g.name)))}
      linkIndex={linkIndex} warn={groupWarn(g.name)}
      canEdit={canEdit} onEdit={() => openGroup(g.name)} onDelete={() => deleteGroup(g.name)}
      onExclude={(card) => setCardExcluded(g.name, card, true)}
      onRestore={(card) => setCardExcluded(g.name, card, false)}
      onSelectLink={selectLink} onFocusCard={setFocal} onHoverCard={setHoverCard}
    />
  } else if (view.startsWith('l:') && linkByLabel[view.slice(2)]) {
    const l = linkByLabel[view.slice(2)]
    detail = <LinkDetail
      key={l.label}
      link={l} color={ruleColor(linkIndex[l.label])}
      edgeCount={linkEdgeCounts[l.label] || 0}
      groupIndex={groupIndex} groupCards={groupCards} warn={linkWarn(l.label)}
      canEdit={canEdit} onEdit={() => openLink(l.label)} onDelete={() => deleteLink(l.label)}
      onSelectGroup={selectGroup} onFocusCard={setFocal}
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
      canEdit={canEdit} onSelectGroup={selectGroup} onSelectLink={selectLink} onEditLink={openLink}
      onSwap={swapCards} onClear={() => setVs('')}
    />
  } else {
    detail = <Overview
      nodes={nodes} groups={groups} links={links} edges={edges}
      audit={audit} membershipsLoading={membershipsLoading} cardGroups={cardGroups}
      onAudit={() => selectView('audit')}
    />
  }

  let readOnlyNotice = null
  if (writable === false) {
    readOnlyNotice = <Alert className="de-readonly" color="gray" variant="light">{RULES_COPY.toolbar.readOnly}</Alert>
  }

  return (
    <>
    {toolbar}
    {readOnlyNotice}
    <div className={'de-page' + (view === 'review' ? ' de-page-review' : '')}>
      <Registry
        groups={groups} links={links} view={view}
        groupCards={groupCards} linkEdgeCounts={linkEdgeCounts}
        groupWarn={groupWarn} linkWarn={linkWarn} canEdit={canEdit}
        onSelectGroup={selectGroup} onSelectLink={selectLink}
        onNewGroup={() => setGroupEditor({ original: null })}
        onNewLink={() => setLinkEditor({ original: null })}
      />

      <div className="de-main-col">
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
      </div>

      {status && <div className="de-status" role="status">{status}</div>}
      {hoverCard && !groupEditor && !linkEditor &&
        <div className="deck-hover-preview"><img className="kit-card-image" src={CardImageURL({ name: hoverCard })} alt={hoverCard} /></div>
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
          cardNames={names}
          groups={groups}
          onSave={saveLink}
          onCancel={() => setLinkEditor(null)}
          onGroupSaved={saveGroupByIndex}
        />
      }
    </div>
    </>
  )
}
