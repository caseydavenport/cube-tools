import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCube } from '../contexts/CubeContext.js'
import { CardImageURL } from '../utils/Utils.js'
import { ColorImages } from '../utils/Colors.js'
import {
  useAllMemberships,
  whyLinked,
  saveDesignMap,
  ruleColor,
  getNodeColor,
  GroupEditModal,
  LinkEditModal,
} from './DesignMap.js'

// DesignEditorPage is a card-centric view/editor for the design-map linkages. Pick
// a focal card to see which groups it's in and why (the matching condition); pick a
// comparison card to see the links between the two and why. Clicking a group or link
// opens its editor. The focal/comparison pair lives in the URL, so any view is
// linkable and shareable.
export function DesignEditorPage() {
  const cube = useCube()
  const [params, setParams] = useSearchParams()
  const focal = params.get('card') || ''
  const vs = params.get('vs') || ''

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

  // name -> [{ group, conds }] : which groups each card is in, and via which conditions.
  const cardGroups = useAllMemberships(cube, groups)

  const nodeByName = useMemo(() => Object.fromEntries(nodes.map(n => [n.name, n])), [nodes])
  const names = useMemo(() => nodes.map(n => n.name).sort(), [nodes])
  const groupIndex = useMemo(() => Object.fromEntries(groups.map((g, i) => [g.name, i])), [groups])
  const linkIndex = useMemo(() => Object.fromEntries(links.map((l, i) => [l.label, i])), [links])
  const linkByLabel = useMemo(() => Object.fromEntries(links.map(l => [l.label, l])), [links])
  const groupNames = useMemo(() => groups.map(g => g.name), [groups])

  const setFocal = (name) => setSearch('card', name)
  const setVs = (name) => setSearch('vs', name)
  function setSearch(key, name) {
    const p = new URLSearchParams(params)
    if (name) p.set(key, name); else p.delete(key)
    setParams(p, { replace: true })
  }

  // Editor state. Each holds { original } - the group/link being edited, or null
  // `original` for a brand-new one.
  const [groupEditor, setGroupEditor] = useState(null)
  const [linkEditor, setLinkEditor] = useState(null)
  const [status, setStatus] = useState('')

  // --- save handlers (mirror RulesPanel in DesignMap.js) -----------------------
  function saveGroup(updated) {
    const conditions = updated.conditions.map(c => c.trim()).filter(Boolean)
    if (conditions.length === 0) { setStatus('At least one condition is required.'); return }
    const newName = updated.name.trim() || 'Untitled group'
    const orig = groupEditor?.original
    let newGroups, newLinks = links
    if (orig) {
      newGroups = groups.map(g => g.name === orig.name ? { name: newName, conditions } : g)
      if (orig.name !== newName) {
        newLinks = links.map(l => ({
          ...l,
          sources: (l.sources || []).map(s => s === orig.name ? newName : s),
          targets: (l.targets || []).map(t => t === orig.name ? newName : t),
        }))
      }
    } else {
      newGroups = [...groups, { name: newName, conditions }]
    }
    saveDesignMap(cube, newGroups, newLinks, refetch, setStatus)
    setGroupEditor(null)
  }

  function saveLink(updated) {
    const sources = (updated.sources || []).filter(Boolean)
    const targets = (updated.targets || []).filter(Boolean)
    if (sources.length === 0 || targets.length === 0) {
      setStatus('At least one source and one target group are required.'); return
    }
    const label = updated.label.trim() || 'Untitled link'
    const orig = linkEditor?.original
    const entry = { label, sources, targets }
    const newLinks = orig
      ? links.map(l => l.label === orig.label ? entry : l)
      : [...links, entry]
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
      newLinks = links.map(l => ({
        ...l,
        sources: (l.sources || []).map(s => s === orig.name ? newName : s),
        targets: (l.targets || []).map(t => t === orig.name ? newName : t),
      }))
    }
    saveDesignMap(cube, newGroups, newLinks, refetch, setStatus)
    setGroupEditor(null)
  }

  // Links between the two selected cards, with the "why" bridges.
  const between = useMemo(() => {
    if (!focal || !vs) return []
    return whyLinked(focal, vs, edges, linkByLabel, cardGroups)
  }, [focal, vs, edges, linkByLabel, cardGroups])

  if (!data) {
    return <div className="design-editor"><div className="de-loading">Loading design map…</div></div>
  }

  const focalNode = nodeByName[focal]
  const vsNode = nodeByName[vs]
  const sortMemberships = (name) => (cardGroups[name] || []).slice().sort((a, b) => a.group.localeCompare(b.group))
  const focalMemberships = sortMemberships(focal)
  const vsMemberships = sortMemberships(vs)

  return (
    <div className="design-editor">
      <datalist id="de-card-names">
        {names.map(n => <option key={n} value={n} />)}
      </datalist>

      <div className="de-topbar">
        <span className="section-heading" style={{ margin: 0 }}>Design Editor</span>
        <div className="de-topbar-actions">
          <button className="button" onClick={() => setGroupEditor({ original: null })}>+ New group</button>
          <button className="button" onClick={() => setLinkEditor({ original: null })}>+ New link</button>
          {status && <span className="de-status">{status}</span>}
        </div>
      </div>

      <div className="de-cols">
        {/* Focal card + its groups. */}
        <CardPanel
          value={focal} onPick={setFocal} names={names} node={focalNode}
          memberships={focalMemberships} groupIndex={groupIndex} onOpenGroup={openGroup}
          placeholder="Search a card…" emptyMsg="Search for a card to see its groups."
        />

        {/* Links between the two cards - the thing that connects the groups. */}
        <div className="de-panel de-links-panel">
          <div className="de-subhead">Links {focal && vs && between.length ? `(${between.length})` : ''}</div>
          {(!focal || !vs) && <div className="de-empty">Select two cards to see the links between them.</div>}
          {focal && vs && between.length === 0 && <div className="de-muted">No links between these two cards.</div>}
          {focal && vs && between.map(r => (
            <div key={r.label} className="de-linkgroup">
              <button className="de-link" onClick={() => openLink(r.label)} title="Edit this link">
                <span className="dm-swatch" style={{ background: ruleColor(linkIndex[r.label] ?? 0) }} />
                <span className="de-link-label">{r.label}</span>
                <span className="de-edit-hint">edit ▸</span>
              </button>
              {r.bridges.map((b, i) => (
                <div key={i} className="de-why">
                  <span className="de-why-group">{b.focusGroup}</span>
                  <span className="de-why-arrow">→</span>
                  <span className="de-why-group">{b.neighGroup}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Comparison card + its groups (mirrors the focal card). */}
        <CardPanel
          value={vs} onPick={setVs} names={names} node={vsNode}
          memberships={vsMemberships} groupIndex={groupIndex} onOpenGroup={openGroup}
          placeholder="Compare with another card…" emptyMsg="Search a card to compare."
        />
      </div>

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
          link={linkEditor.original || { label: '', sources: [''], targets: [''] }}
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

  function openGroup(name) {
    const g = groups.find(x => x.name === name)
    if (g) setGroupEditor({ original: g })
  }
  function openLink(label) {
    const l = links.find(x => x.label === label)
    if (l) setLinkEditor({ original: l })
  }
}

// CardPanel is one side of the editor: a card search box, the selected card's image,
// and the groups it belongs to (each with the matching condition). Group chips are
// clickable to edit the group. Focal and comparison cards both use this.
function CardPanel({ value, onPick, names, node, memberships, groupIndex, onOpenGroup, placeholder, emptyMsg }) {
  return (
    <div className="de-panel">
      <CardSearch value={value} onPick={onPick} names={names} placeholder={placeholder} />
      {!value && <div className="de-empty">{emptyMsg}</div>}
      {value &&
        <div className="de-card">
          <img className="de-card-img" src={CardImageURL({ name: value })} alt={value} />
          <div className="de-card-body">
            <div className="de-card-name">
              {node && <span className="de-pips">{ColorImages(node.colors)}</span>}
              {value}
            </div>
            <div className="de-subhead">In groups {memberships.length ? `(${memberships.length})` : ''}</div>
            {memberships.length === 0 && <div className="de-muted">Not in any group.</div>}
            {memberships.map(m => (
              <button key={m.group} className="de-group" onClick={() => onOpenGroup(m.group)} title="Edit this group">
                <span className="dm-swatch" style={{ background: ruleColor(groupIndex[m.group] ?? 0) }} />
                <span className="de-group-name">{m.group}</span>
                <span className="de-conds">{(m.conds || []).join('  ·  ')}</span>
              </button>
            ))}
          </div>
        </div>
      }
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
