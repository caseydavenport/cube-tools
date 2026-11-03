// The Rules editor page: loads the rules and the package board, keeps the
// view and search in the URL, and saves edits. The views live in the other
// files here.

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCube } from '../../contexts/CubeContext.js'
import { rulesBoardUrl } from '../../stats/pageRequests.js'
import { useAllMemberships, saveDesignMap } from '../map/designData.js'
import { cleanWires } from '../../utils/DesignRules.js'
import { ruleColor } from '../map/ruleColors.js'
import { GroupEditModal } from '../map/GroupEditModal.js'
import { PackageEditModal } from '../map/PackageEditModal.js'
import { packagePageHref } from '../../shell/paths.js'
import { cleanGroup, withCardExcluded, withGroup } from "./rulebookEdits.js"
import { auditRulebook, groupWarning, packageWarning } from "./rulebookAudit.js"
import { EditorToolbar } from "./EditorToolbar.js"
import { nextEditorParams } from "./editorParams.js"
import { ReviewDetail } from "./ReviewDetail.js"
import { GroupView } from "./GroupView.js"
import { PackageBoard } from "./PackageBoard.js"
import { RULES_COPY } from "./copy.js"
import "../../components/kit/popover.css"
import "./rules.css"
import "../../decks/decks.css"

// DesignEditorPage is the Rules editor. Its home is the package board; a
// group opens full width, a package opens its own page, and Review steps
// through every card.
// The view, search, sort and review position live in the URL, so any state
// can be shared. startDate and endDate bound the board's build stats.
export function DesignEditorPage({ startDate, endDate }) {
  const cube = useCube()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const focal = params.get('card') || ''
  const view = params.get('view') || ''
  const q = params.get('q') || ''
  const sort = params.get('sort') || 'az'
  const range = { start: startDate || '', end: endDate || '' }

  // The design graph and the board, both refetched after each save so edits
  // show immediately.
  const [data, setData] = useState(null)
  const [board, setBoard] = useState(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let alive = true
    fetch(`/api/${cube}/stats/design-graph`)
      .then(r => r.json())
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({}) })
    return () => { alive = false }
  }, [cube, refresh])
  useEffect(() => {
    let alive = true
    fetch(rulesBoardUrl(cube, { start: startDate || '', end: endDate || '' }))
      .then(r => r.json())
      .then(b => { if (alive) setBoard(b) })
      .catch(() => { if (alive) setBoard({ packages: [], unused_groups: [] }) })
    return () => { alive = false }
  }, [cube, refresh, startDate, endDate])
  const refetch = () => setRefresh(r => r + 1)

  const nodes = data?.nodes || []
  const groups = data?.groups || []
  const packages = data?.packages || []
  const allEdges = data?.edges || []
  const groupNodes = data?.group_nodes || []

  // Edges can reach cards cut from the cube - the graph widens its edge set so
  // old decks still render cut cards. The editor counts cube cards only.
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
  const groupNames = useMemo(() => groups.map(g => g.name), [groups])
  const groupCards = useMemo(() => Object.fromEntries(groupNodes.map(g => [g.name, g])), [groupNodes])
  const groupsByName = useMemo(() => Object.fromEntries(groups.map(g => [g.name, g])), [groups])

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

  // Broken-rule checks, shown on the package or group they belong to.
  const audit = useMemo(
    () => auditRulebook({ packages, groups, groupNames, groupCards, names }),
    [packages, groups, groupNames, groupCards, names],
  )

  // --- URL state ---------------------------------------------------------------
  function patchParams(patch) {
    const next = nextEditorParams(params, patch)
    setParams(next.params, { replace: !next.push })
  }
  const selectView = (v) => patchParams({ view: v })
  const selectGroup = (name) => patchParams({ view: 'g:' + name })
  const selectPackage = (label) => navigate(packagePageHref(cube, label))

  // Editor state. Each holds { original } - the group/package being edited, or null
  // `original` for a brand-new one.
  const [groupEditor, setGroupEditor] = useState(null)
  const [packageEditor, setPackageEditor] = useState(null)
  const [status, setStatus] = useState('')

  // --- save/delete handlers ------------------------------------------------------
  function saveGroup(updated) {
    const entry = cleanGroup(updated)
    if (!entry) { setStatus(RULES_COPY.page.conditionRequired); return }
    const orig = groupEditor?.original
    const next = withGroup({ groups, packages }, orig ? orig.name : '', entry)
    if (orig && orig.name !== entry.name && view === 'g:' + orig.name) selectGroup(entry.name)
    saveDesignMap(cube, next.groups, next.packages, refetch, setStatus)
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
    saveDesignMap(cube, groups, newPackages, refetch, setStatus)
    setPackageEditor(null)
  }

  // Group edits triggered from inside the package editor (by group index).
  const saveGroupByIndex = (idx, updated) => {
    const entry = cleanGroup(updated)
    if (!entry) { setStatus(RULES_COPY.page.conditionRequired); return }
    const next = withGroup({ groups, packages }, groups[idx].name, entry)
    saveDesignMap(cube, next.groups, next.packages, refetch, setStatus)
    setGroupEditor(null)
  }

  // One-click hole-poking from the group roster: add or remove a card on the
  // group's exclude list and save immediately.
  function setCardExcluded(groupName, cardName, excluded) {
    const newGroups = withCardExcluded(groups, groupName, cardName, excluded)

    // Show the change before the save returns, so a second click right after
    // builds on this one instead of on the rules from before it.
    setData(prev => ({ ...prev, groups: newGroups }))
    saveDesignMap(cube, newGroups, packages, refetch, setStatus)
  }

  // Deleting a group also removes it from every wire end; a wire left with an
  // empty side shows as a broken package on the board rather than vanishing.
  function deleteGroup(name) {
    const newGroups = groups.filter(g => g.name !== name)
    const newPackages = packages.map(l => ({
      ...l,
      wires: (l.wires || []).map(w => ({
        ...w,
        sources: (w.sources || []).filter(s => s !== name),
        targets: (w.targets || []).filter(t => t !== name),
      })),
    }))
    saveDesignMap(cube, newGroups, newPackages, refetch, setStatus)
    if (view === 'g:' + name) selectView('')
  }

  const toolbar = (
    <EditorToolbar
      view={view} q={q} cube={cube}
      onSearch={text => patchParams({ q: text, view: '' })}
      onSelectView={selectView}
      onNewPackage={() => setPackageEditor({ original: null })}
      onNewGroup={() => setGroupEditor({ original: null })}
    />
  )

  if (!data || !board) {
    return <>
      {toolbar}
      <div className="rb-page"><div className="de-loading">{RULES_COPY.page.loading}</div></div>
    </>
  }

  function openGroup(name) {
    const g = groups.find(x => x.name === name)
    if (g) setGroupEditor({ original: g })
  }

  // Share of cube cards in at least one group, once memberships have loaded.
  let coverage = null
  if (!membershipsLoading && nodes.length > 0) {
    const grouped = nodes.filter(n => (cardGroups[n.name] || []).length > 0).length
    coverage = Math.round(100 * grouped / nodes.length)
  }

  // Resolve the main view from the view param; anything unknown is the board.
  let main
  const viewName = view.slice(2)
  const backToBoard = () => selectView('')
  if (view.startsWith('g:')) {
    let color = 'var(--se-muted)'
    if (groupIndex[viewName] !== undefined) {
      color = ruleColor(groupIndex[viewName])
    }
    main = <GroupView
      key={viewName} name={viewName} group={groupsByName[viewName]} color={color}
      warning={groupWarning(audit, viewName)} refresh={refresh} range={range}
      onBack={backToBoard} onEdit={() => openGroup(viewName)} onDelete={() => deleteGroup(viewName)}
      onExclude={(group, card) => setCardExcluded(group, card, true)}
      onRestore={(group, card) => setCardExcluded(group, card, false)}
    />
  } else if (view === 'review' && names.length > 0) {
    const current = nodeByName[focal] ? focal : names[0]
    main = <ReviewDetail
      names={names} card={current} node={nodeByName[current]}
      memberships={(cardGroups[current] || []).slice().sort((a, b) => a.group.localeCompare(b.group))}
      membershipsLoading={membershipsLoading}
      neighbors={neighborsOf[current] || []}
      groupIndex={groupIndex} packageIndex={packageIndex}
      keysEnabled={!groupEditor && !packageEditor}
      onGo={(n) => patchParams({ card: n })}
      onSelectGroup={selectGroup} onSelectPackage={selectPackage}
    />
  } else {
    main = <PackageBoard
      board={board} q={q} sort={sort} cardNames={names}
      totals={{ groups: groups.length, pairs: edges.length, coverage }}
      problemOf={name => packageWarning(audit, name)}
      onOpenPackage={selectPackage} onOpenGroup={selectGroup}
      onSort={value => patchParams({ sort: value === 'az' ? '' : value })}
    />
  }

  return (
    <>
    {toolbar}
    <div className="rb-page">
      {main}

      {status && <div className="de-status" role="status">{status}</div>}

      {groupEditor &&
        <GroupEditModal
          group={groupEditor.original || { name: '', conditions: [''] }}
          color={ruleColor(groupEditor.original ? (groupIndex[groupEditor.original.name] ?? 0) : groups.length)}
          rules={{ groups, packages }}
          range={range}
          onSave={saveGroup}
          onCancel={() => setGroupEditor(null)}
        />
      }
      {packageEditor &&
        <PackageEditModal
          pkg={packageEditor.original || { name: '', wires: [] }}
          color={ruleColor(packageEditor.original ? (packageIndex[packageEditor.original.name] ?? 0) : packages.length)}
          groupNames={groupNames}
          groups={groups}
          rules={{ groups, packages }}
          range={range}
          onSave={savePackage}
          onCancel={() => setPackageEditor(null)}
          onGroupSaved={saveGroupByIndex}
        />
      }
    </div>
    </>
  )
}
