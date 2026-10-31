// The Rules editor page: loads the rulebook, works out its audit, keeps the
// selection in the URL, and saves edits. The panes live in the other files here.

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '@mantine/core'
import { useCube } from '../../contexts/CubeContext.js'
import { cardPageHref } from '../../shell/paths.js'
import { CardImageURL } from '../../utils/Utils.js'
import { useAllMemberships, whyLinked, saveDesignMap, cleanWires } from '../map/designData.js'
import { ruleColor } from '../map/ruleColors.js'
import { GroupEditModal } from '../map/GroupEditModal.js'
import { PackageEditModal } from '../map/PackageEditModal.js'
import { useCubeWritable } from '../../utils/useCubeWritable.js'
import { renameInPackage, withExclude } from "./rulebookEdits.js"
import { auditRulebook, groupWarning, packageWarning } from "./rulebookAudit.js"
import { EditorToolbar } from "./EditorToolbar.js"
import { GroupDetail } from "./GroupDetail.js"
import { PackageDetail } from "./PackageDetail.js"
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
// a registry of every group and package (browse, create, spot problems), a detail
// pane for whatever's selected (group roster, package wiring, card-vs-card compare,
// or the audit board), and a card lens showing any card's memberships and packages.
// Selection lives in the URL (card, vs, view) so any state is shareable.
export function DesignEditorPage() {
  const cube = useCube()
  const navigate = useNavigate()
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
  const packages = data?.packages || []
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
  const packageIndex = useMemo(() => Object.fromEntries(packages.map((l, i) => [l.name, i])), [packages])
  const packageByName = useMemo(() => Object.fromEntries(packages.map(l => [l.name, l])), [packages])
  const groupNames = useMemo(() => groups.map(g => g.name), [groups])
  const groupCards = useMemo(() => Object.fromEntries(groupNodes.map(g => [g.name, g])), [groupNodes])

  // package name -> number of card-to-card edges that package creates.
  const packageEdgeCounts = useMemo(() => {
    const m = {}
    for (const e of edges) for (const n of (e.packages || [])) m[n] = (m[n] || 0) + 1
    return m
  }, [edges])

  // name -> [{ name, packages }] : every card a card connects to, and through which packages.
  const neighborsOf = useMemo(() => {
    const m = {}
    const add = (a, b, packageNames) => { (m[a] = m[a] || []).push({ name: b, packages: packageNames || [] }) }
    for (const e of edges) {
      add(e.source, e.target, e.packages)
      add(e.target, e.source, e.packages)
    }
    return m
  }, [edges])

  // Systematic health checks over the rulebook. Structural issues (definitionally
  // wrong) feed the registry badge; coverage lists (judgment calls) only show on
  // the audit board.
  const audit = useMemo(
    () => auditRulebook({ packages, groups, groupNames, groupCards, names, cardGroups, membershipsLoading, neighborsOf }),
    [packages, groups, groupNames, groupCards, names, cardGroups, membershipsLoading, neighborsOf],
  )

  const groupWarn = (name) => groupWarning(audit, name)
  const packageWarn = (label) => packageWarning(audit, label)

  // --- URL state ---------------------------------------------------------------
  function patchParams(patch) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k) }
    setParams(p, { replace: true })
  }
  const selectView = (v) => patchParams({ view: v })
  const selectGroup = (name) => patchParams({ view: 'g:' + name })
  const selectPackage = (label) => patchParams({ view: 'p:' + label })
  const setFocal = (name) => patchParams({ card: name, ...(name ? {} : { vs: '', view: view === 'compare' ? '' : view }) })
  const setVs = (name) => patchParams({ vs: name, view: name ? 'compare' : (view === 'compare' ? '' : view) })
  const swapCards = () => patchParams({ card: vs, vs: focal })

  // Editor state. Each holds { original } - the group/package being edited, or null
  // `original` for a brand-new one.
  const [groupEditor, setGroupEditor] = useState(null)
  const [packageEditor, setPackageEditor] = useState(null)
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
    let newGroups, newPackages = packages
    if (orig) {
      newGroups = groups.map(g => g.name === orig.name ? entry : g)
      if (orig.name !== newName) {
        newPackages = packages.map(l => renameInPackage(l, orig.name, newName))
        if (view === 'g:' + orig.name) selectGroup(newName)
      }
    } else {
      newGroups = [...groups, entry]
    }
    saveDesignMap(cube, newGroups, newPackages, refetch, setStatus)
    setGroupEditor(null)
  }

  function savePackage(updated) {
    const wires = cleanWires(updated.wires)
    if (!wires) {
      setStatus(RULES_COPY.page.wireNeedsEnds); return
    }
    // copy-ok: name saved to the rules file
    const name = updated.name.trim() || 'Untitled package'
    const orig = packageEditor?.original
    const entry = { name, wires }
    const newPackages = orig
      ? packages.map(l => l.name === orig.name ? entry : l)
      : [...packages, entry]
    if (orig && orig.name !== name && view === 'p:' + orig.name) selectPackage(name)
    saveDesignMap(cube, groups, newPackages, refetch, setStatus)
    setPackageEditor(null)
  }

  // Group edits triggered from inside the package editor (by group index).
  const saveGroupByIndex = (idx, updated) => {
    const conditions = updated.conditions.map(c => c.trim()).filter(Boolean)
    if (conditions.length === 0) { setStatus(RULES_COPY.page.conditionRequired); return }
    const orig = groups[idx]
    // copy-ok: name saved to the rules file
    const newName = updated.name.trim() || 'Untitled group'
    const entry = withExclude({ name: newName, conditions }, (updated.exclude || []).filter(Boolean))
    const newGroups = groups.map((g, i) => i === idx ? entry : g)
    let newPackages = packages
    if (orig.name !== newName) {
      newPackages = packages.map(l => renameInPackage(l, orig.name, newName))
    }
    saveDesignMap(cube, newGroups, newPackages, refetch, setStatus)
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
    saveDesignMap(cube, newGroups, packages, refetch, setStatus)
  }

  // Deleting a group also removes it from every wire end; a wire left with an
  // empty side shows up on the audit board rather than silently vanishing.
  function deleteGroup(name) {
    const newGroups = groups.filter(g => g.name !== name)
    const newPackages = packages.map(l => ({
      ...l,
      wires: (l.wires || []).map(w => ({
        sources: (w.sources || []).filter(s => s !== name),
        targets: (w.targets || []).filter(t => t !== name),
      })),
    }))
    saveDesignMap(cube, newGroups, newPackages, refetch, setStatus)
    if (view === 'g:' + name) selectView('')
  }

  function deletePackage(label) {
    saveDesignMap(cube, groups, packages.filter(l => l.name !== label), refetch, setStatus)
    if (view === 'p:' + label) selectView('')
  }

  // Packages between the two selected cards, with the "why" bridges.
  const between = useMemo(() => {
    if (!focal || !vs) return []
    return whyLinked(focal, vs, edges, packageByName, cardGroups)
  }, [focal, vs, edges, packageByName, cardGroups])

  // Edit controls only show once the server says the cube is writable; the
  // read-only notice waits for it to say it isn't, so it doesn't flash on load.
  const canEdit = writable === true

  // tryCard opens the card page of any card, in the cube or not, to see what
  // the rules would make of it.
  function tryCard(name) {
    if (name) {
      navigate(cardPageHref(cube, name))
    }
  }

  const toolbar = (
    <EditorToolbar
      view={view} auditCount={data ? audit.structural : 0}
      compareReady={Boolean(focal && vs)} onSelectView={selectView}
      cube={cube} onTryCard={tryCard}
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
  function openPackage(label) {
    const l = packages.find(x => x.name === label)
    if (l) setPackageEditor({ original: l })
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
      packagesTouching={packages.filter(l => (l.wires || []).some(w => (w.sources || []).includes(g.name) || (w.targets || []).includes(g.name)))}
      packageIndex={packageIndex} warn={groupWarn(g.name)}
      canEdit={canEdit} onEdit={() => openGroup(g.name)} onDelete={() => deleteGroup(g.name)}
      onExclude={(card) => setCardExcluded(g.name, card, true)}
      onRestore={(card) => setCardExcluded(g.name, card, false)}
      onSelectPackage={selectPackage} onFocusCard={setFocal} onHoverCard={setHoverCard}
      initialCheck={params.get('check') || ''}
    />
  } else if (view.startsWith('p:') && packageByName[view.slice(2)]) {
    const l = packageByName[view.slice(2)]
    detail = <PackageDetail
      key={l.name}
      pkg={l} color={ruleColor(packageIndex[l.name])}
      edgeCount={packageEdgeCounts[l.name] || 0}
      groupIndex={groupIndex} groupCards={groupCards} warn={packageWarn(l.name)}
      canEdit={canEdit} onEdit={() => openPackage(l.name)} onDelete={() => deletePackage(l.name)}
      onSelectGroup={selectGroup} onFocusCard={setFocal}
    />
  } else if (view === 'audit') {
    detail = <AuditBoard
      audit={audit} membershipsLoading={membershipsLoading}
      nodeByName={nodeByName} groupIndex={groupIndex} packageIndex={packageIndex}
      onSelectGroup={selectGroup} onSelectPackage={selectPackage}
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
      groupIndex={groupIndex} packageIndex={packageIndex}
      keysEnabled={!groupEditor && !packageEditor}
      onGo={(n) => patchParams({ card: n })}
      onSelectGroup={selectGroup} onSelectPackage={selectPackage}
    />
  } else if (view === 'compare' && focal && vs) {
    detail = <CompareDetail
      focal={focal} vs={vs} between={between} nodeByName={nodeByName}
      cardGroups={cardGroups} groupIndex={groupIndex} packageIndex={packageIndex}
      canEdit={canEdit} onSelectGroup={selectGroup} onSelectPackage={selectPackage} onEditPackage={openPackage}
      onSwap={swapCards} onClear={() => setVs('')}
    />
  } else {
    detail = <Overview
      nodes={nodes} groups={groups} packages={packages} edges={edges}
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
        groups={groups} packages={packages} view={view}
        groupCards={groupCards} packageEdgeCounts={packageEdgeCounts}
        groupWarn={groupWarn} packageWarn={packageWarn} canEdit={canEdit}
        onSelectGroup={selectGroup} onSelectPackage={selectPackage}
        onNewGroup={() => setGroupEditor({ original: null })}
        onNewPackage={() => setPackageEditor({ original: null })}
      />

      <div className="de-main-col">
        <main className="de-detail">{detail}</main>

        {view !== 'review' && <CardLens
          names={names} focal={focal} vs={vs} node={nodeByName[focal]}
          memberships={(cardGroups[focal] || []).slice().sort((a, b) => a.group.localeCompare(b.group))}
          membershipsLoading={membershipsLoading}
          neighbors={neighborsOf[focal] || []}
          groupIndex={groupIndex} packageIndex={packageIndex}
          onPickFocal={setFocal} onPickVs={setVs}
          onSelectGroup={selectGroup} onSelectPackage={selectPackage}
          onCompare={() => selectView('compare')} onHoverCard={setHoverCard}
        />}
      </div>

      {status && <div className="de-status" role="status">{status}</div>}
      {hoverCard && !groupEditor && !packageEditor &&
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
      {packageEditor &&
        <PackageEditModal
          pkg={packageEditor.original || { name: '', wires: [{ sources: [''], targets: [''] }] }}
          color={ruleColor(packageEditor.original ? (packageIndex[packageEditor.original.name] ?? 0) : packages.length)}
          groupNames={groupNames}
          cardNames={names}
          groups={groups}
          onSave={savePackage}
          onCancel={() => setPackageEditor(null)}
          onGroupSaved={saveGroupByIndex}
        />
      }
    </div>
    </>
  )
}
