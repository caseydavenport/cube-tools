import React, { useRef, useEffect, useCallback, useState } from 'react'
import ReactDOM from 'react-dom'
import { White, Blue, Black, Red, Green } from "../utils/Colors.js"

export function DesignMapWidget({ show, designGraphData, onCardSelected, onRulesChanged }) {
  const [selectedLink, setSelectedLink] = useState(null)
  const [selectedCard, setSelectedCard] = useState(null)
  const [hoveredCard, setHoveredCard] = useState(null)

  if (!show) return null

  const data = designGraphData || {}
  const nodes = data.nodes || []
  const edges = data.edges || []
  const groups = data.groups || []
  const links = data.links || []

  // When selecting a link, clear card selection and vice versa.
  function handleSelectLink(link) {
    setSelectedLink(link)
    setSelectedCard(null)
  }
  function handleSelectCard(cardName) {
    setSelectedCard(prev => prev === cardName ? null : cardName)
    setSelectedLink(null)
  }

  // Build card list based on current selection.
  let clusterCards = []
  let listLabel = null
  const nodeMap = {}
  for (const node of nodes) nodeMap[node.name] = node

  if (selectedCard) {
    // Show the selected card's neighbors.
    const neighbors = new Set()
    for (const edge of edges) {
      if (edge.source === selectedCard) neighbors.add(edge.target)
      if (edge.target === selectedCard) neighbors.add(edge.source)
    }
    neighbors.add(selectedCard)
    clusterCards = Array.from(neighbors)
      .map(name => nodeMap[name] || { name, colors: [], connection_count: 0 })
      .sort((a, b) => b.connection_count - a.connection_count)
    listLabel = selectedCard
  } else if (selectedLink === "unconnected") {
    clusterCards = nodes.filter(n => n.connection_count === 0).sort((a, b) => a.name.localeCompare(b.name))
    listLabel = "Unconnected"
  } else if (selectedLink !== null && links[selectedLink]) {
    const linkLabel = links[selectedLink].label
    const cardNames = new Set()
    for (const edge of edges) {
      if ((edge.rule_labels || []).includes(linkLabel)) {
        cardNames.add(edge.source)
        cardNames.add(edge.target)
      }
    }
    clusterCards = Array.from(cardNames)
      .map(name => nodeMap[name] || { name, colors: [], connection_count: 0 })
      .sort((a, b) => b.connection_count - a.connection_count)
  } else {
    clusterCards = [...nodes].sort((a, b) => b.connection_count - a.connection_count)
  }

  return (
    <div className="synergy-container" style={{padding: "1rem"}}>
      <div style={{display: "grid", gridTemplateColumns: "350px 1fr 350px", gap: "1rem"}}>
        <RulesPanel groups={groups} links={links} nodes={nodes} edges={edges} onRulesChanged={onRulesChanged} selectedCard={selectedCard} />
        <DesignMapGraph
          nodes={nodes} edges={edges} links={links}
          onCardFocused={handleSelectCard}
          selectedLink={selectedLink} onSelectedLinkChanged={handleSelectLink}
          selectedCard={selectedCard}
          hoveredCard={hoveredCard} onHoveredCardChanged={setHoveredCard}
        />
        <ClusterCardList
          cards={clusterCards}
          edges={edges}
          links={links}
          selectedCard={selectedCard}
          link={typeof selectedLink === "number" ? links[selectedLink] : null}
          linkIndex={typeof selectedLink === "number" ? selectedLink : null}
          listLabel={listLabel}
          onCardFocused={handleSelectCard}
          hoveredCard={hoveredCard}
          onHoveredCardChanged={setHoveredCard}
        />
      </div>
    </div>
  )
}

function saveDesignMap(groups, links, onRulesChanged, onStatus) {
  fetch("/api/save-design-rules", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ groups, links }),
  }).then(r => {
    if (r.ok) {
      if (onStatus) onStatus("")
      if (onRulesChanged) onRulesChanged()
    } else {
      if (onStatus) onStatus("Save failed: " + r.statusText)
    }
  }).catch(e => {
    if (onStatus) onStatus("Save failed: " + e.message)
  })
}

function RulesPanel({ groups, links, nodes, edges, onRulesChanged, selectedCard }) {
  const [activeTab, setActiveTab] = useState("links")
  const [addingGroup, setAddingGroup] = useState(false)
  const [addingLink, setAddingLink] = useState(false)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null)
  const [confirmDeleteLink, setConfirmDeleteLink] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingLink, setEditingLink] = useState(null)
  const [saveStatus, setSaveStatus] = useState("")

  function addGroup(newGroup) {
    const conditions = newGroup.conditions.map(c => c.trim()).filter(c => c)
    if (conditions.length === 0) {
      setSaveStatus("At least one condition is required.")
      return
    }
    const updated = [...groups, {
      name: newGroup.name.trim() || "Untitled group",
      conditions,
    }]
    saveDesignMap(updated, links, onRulesChanged, setSaveStatus)
    setAddingGroup(false)
  }

  function updateGroup(index, updatedGroup) {
    const conditions = updatedGroup.conditions.map(c => c.trim()).filter(c => c)
    if (conditions.length === 0) {
      setSaveStatus("At least one condition is required.")
      return
    }
    const newName = updatedGroup.name.trim() || "Untitled group"
    const oldName = groups[index].name
    const updatedGroups = groups.map((g, i) => i === index ? { name: newName, conditions } : g)

    // If the name changed, update any links that reference the old name.
    let updatedLinks = links
    if (oldName !== newName) {
      updatedLinks = links.map(l => ({
        ...l,
        sources: (l.sources || []).map(s => s === oldName ? newName : s),
        targets: (l.targets || []).map(t => t === oldName ? newName : t),
      }))
    }
    saveDesignMap(updatedGroups, updatedLinks, onRulesChanged, setSaveStatus)
    setEditingGroup(null)
  }

  function deleteGroup(index) {
    const updated = groups.filter((_, i) => i !== index)
    saveDesignMap(updated, links, onRulesChanged, setSaveStatus)
    setConfirmDeleteGroup(null)
  }

  function addLink(newLink) {
    const sources = (newLink.sources || []).filter(s => s)
    const targets = (newLink.targets || []).filter(t => t)
    if (sources.length === 0 || targets.length === 0) {
      setSaveStatus("At least one source and one target group are required.")
      return
    }
    const updated = [...links, {
      label: newLink.label.trim() || "Untitled link",
      sources,
      targets,
    }]
    saveDesignMap(groups, updated, onRulesChanged, setSaveStatus)
    setAddingLink(false)
  }

  function updateLink(index, updatedLink) {
    const sources = (updatedLink.sources || []).filter(s => s)
    const targets = (updatedLink.targets || []).filter(t => t)
    if (sources.length === 0 || targets.length === 0) {
      setSaveStatus("At least one source and one target group are required.")
      return
    }
    const updated = links.map((l, i) => i === index ? {
      label: updatedLink.label.trim() || "Untitled link",
      sources,
      targets,
    } : l)
    saveDesignMap(groups, updated, onRulesChanged, setSaveStatus)
    setEditingLink(null)
  }

  function deleteLink(index) {
    const updated = links.filter((_, i) => i !== index)
    saveDesignMap(groups, updated, onRulesChanged, setSaveStatus)
    setConfirmDeleteLink(null)
  }

  // When a card is selected, find which link labels connect to it via edges.
  const activeLabels = React.useMemo(() => {
    if (!selectedCard) return null
    const labels = new Set()
    for (const e of edges) {
      if (e.source === selectedCard || e.target === selectedCard) {
        for (const l of (e.rule_labels || [])) labels.add(l)
      }
    }
    return labels.size > 0 ? labels : null
  }, [selectedCard, edges])

  // Auto-switch to links tab when a card with links is selected.
  useEffect(() => {
    if (activeLabels && activeLabels.size > 0) setActiveTab("links")
  }, [activeLabels])

  // When a card is selected, query the backend to find which groups actually contain it.
  const [activeGroupNames, setActiveGroupNames] = useState(null)
  useEffect(() => {
    if (!selectedCard || groups.length === 0) {
      setActiveGroupNames(null)
      return
    }
    // Build parallel conditions/groups arrays from all groups.
    const conditions = []
    const groupLabels = []
    for (const g of groups) {
      for (const c of (g.conditions || [])) {
        conditions.push(c)
        groupLabels.push(g.name)
      }
    }
    if (conditions.length === 0) { setActiveGroupNames(null); return }

    fetch("/api/stats/design-graph/match", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ conditions, groups: groupLabels }),
    })
      .then(r => r.json())
      .then(data => {
        const card = (data.cards || []).find(c => c.name === selectedCard)
        if (card) {
          setActiveGroupNames(new Set(card.conditions.map(mc => mc.group).filter(g => g)))
        } else {
          setActiveGroupNames(null)
        }
      })
      .catch(() => setActiveGroupNames(null))
  }, [selectedCard, groups])

  // Sort links so matching ones appear first when a card is selected.
  const sortedLinkIndices = React.useMemo(() => {
    const indices = links.map((_, i) => i)
    if (!activeLabels) return indices
    return indices.sort((a, b) => {
      const aMatch = activeLabels.has(links[a].label) ? 0 : 1
      const bMatch = activeLabels.has(links[b].label) ? 0 : 1
      return aMatch - bMatch
    })
  }, [links, activeLabels])

  // Sort groups so matching ones appear first when a card is selected.
  const sortedGroupIndices = React.useMemo(() => {
    const indices = groups.map((_, i) => i)
    if (!activeGroupNames) return indices
    return indices.sort((a, b) => {
      const aMatch = activeGroupNames.has(groups[a].name) ? 0 : 1
      const bMatch = activeGroupNames.has(groups[b].name) ? 0 : 1
      return aMatch - bMatch
    })
  }, [groups, activeGroupNames])

  const groupNames = groups.map(g => g.name)
  const usedGroupNames = new Set(links.flatMap(l => [...(l.sources || []), ...(l.targets || [])]))

  return (
    <div style={{
      background: "var(--card-background)",
      borderRadius: "8px",
      padding: "1rem",
      overflowY: "auto",
      height: 0,
      minHeight: "100%",
    }}>
      <h4 style={{color: "var(--primary)", margin: "0 0 0.5rem 0", fontSize: "1rem"}}>
        Design Map
      </h4>

      <p style={{color: "var(--text-muted)", fontSize: "0.8em", margin: "0 0 0.75rem 0"}}>
        {nodes.length} cards, {edges.length} edges from {links.length} links, {groups.length} groups
      </p>

      {saveStatus && (
        <p style={{color: "#e55", fontSize: "0.8em", margin: "0.25rem 0 0.5rem 0"}}>{saveStatus}</p>
      )}

      {/* Tab bar */}
      <div style={{display: "flex", gap: 0, marginBottom: "0.75rem", borderBottom: "1px solid var(--page-background)"}}>
        {[
          { key: "groups", label: `Groups (${groups.length})` },
          { key: "links", label: `Links (${links.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === tab.key ? "var(--primary)" : "var(--text-muted)",
              padding: "0.4rem 1rem",
              cursor: "pointer",
              fontSize: "0.85em",
              fontWeight: activeTab === tab.key ? "bold" : "normal",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Groups Tab */}
      {activeTab === "groups" && <>
        {addingGroup && (
          <GroupEditModal
            group={{ name: "", conditions: [""] }}
            color="var(--primary)"
            onSave={addGroup}
            onCancel={() => { setAddingGroup(false); setSaveStatus("") }}
          />
        )}
        <button
          onClick={() => { setAddingGroup(true); setSaveStatus("") }}
          style={{
            background: "transparent",
            border: "1px dashed var(--text-muted)",
            borderRadius: "6px",
            color: "var(--text-muted)",
            width: "100%",
            padding: "0.4rem",
            cursor: "pointer",
            fontSize: "0.85em",
            marginBottom: "0.5rem",
          }}
        >
          + Add Group
        </button>

        {sortedGroupIndices.map(i => {
          const group = groups[i]
          const highlighted = activeGroupNames && activeGroupNames.has(group.name)
          const dimmed = activeGroupNames && !highlighted
          return (
            <GroupCard
              key={i} group={group} index={i}
              unused={!usedGroupNames.has(group.name)}
              confirmDelete={confirmDeleteGroup === i}
              onDeleteClick={() => setConfirmDeleteGroup(confirmDeleteGroup === i ? null : i)}
              onConfirmDelete={() => deleteGroup(i)}
              onCancelDelete={() => setConfirmDeleteGroup(null)}
              isEditing={editingGroup === i}
              onEditClick={() => { setEditingGroup(editingGroup === i ? null : i); setConfirmDeleteGroup(null); setSaveStatus("") }}
              onEditSave={(updated) => updateGroup(i, updated)}
              onEditCancel={() => setEditingGroup(null)}
              dimmed={dimmed}
            />
          )
        })}

        {groups.length === 0 && !addingGroup && (
          <p style={{color: "var(--text-muted)", fontSize: "0.85em", fontStyle: "italic"}}>
            No groups defined yet.
          </p>
        )}
      </>}

      {/* Links Tab */}
      {activeTab === "links" && <>
        {addingLink && (
          <LinkEditModal
            link={{ label: "", sources: [""], targets: [""] }}
            color="var(--primary)"
            groupNames={groupNames}
            groups={groups}
            onSave={addLink}
            onCancel={() => { setAddingLink(false); setSaveStatus("") }}
          />
        )}
        <button
          onClick={() => { setAddingLink(true); setSaveStatus("") }}
          style={{
            background: "transparent",
            border: "1px dashed var(--text-muted)",
            borderRadius: "6px",
            color: "var(--text-muted)",
            width: "100%",
            padding: "0.4rem",
            cursor: "pointer",
            fontSize: "0.85em",
            marginBottom: "0.5rem",
          }}
        >
          + Add Link
        </button>

        {sortedLinkIndices.map(i => {
          const link = links[i]
          const highlighted = activeLabels && activeLabels.has(link.label)
          const dimmed = activeLabels && !highlighted
          return (
            <LinkCard
              key={i} link={link} index={i} groupNames={groupNames} groups={groups}
              confirmDelete={confirmDeleteLink === i}
              onDeleteClick={() => setConfirmDeleteLink(confirmDeleteLink === i ? null : i)}
              onConfirmDelete={() => deleteLink(i)}
              onCancelDelete={() => setConfirmDeleteLink(null)}
              isEditing={editingLink === i}
              onEditClick={() => { setEditingLink(editingLink === i ? null : i); setConfirmDeleteLink(null); setSaveStatus("") }}
              onEditSave={(updated) => updateLink(i, updated)}
              onEditCancel={() => setEditingLink(null)}
              onGroupSaved={(groupIndex, updated) => updateGroup(groupIndex, updated)}
              dimmed={dimmed}
            />
          )
        })}

        {links.length === 0 && !addingLink && (
          <p style={{color: "var(--text-muted)", fontSize: "0.85em", fontStyle: "italic"}}>
            No links defined yet.
          </p>
        )}
      </>}
    </div>
  )
}

function RuleInput({ label, value, onChange, placeholder }) {
  return (
    <div style={{marginBottom: "0.35rem"}}>
      <label style={{fontSize: "0.7em", color: "var(--text-muted)", display: "block", marginBottom: "2px"}}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "var(--card-background)",
          color: "var(--text-color)",
          border: "1px solid var(--card-background)",
          borderRadius: "4px",
          padding: "4px 6px",
          fontSize: "0.8em",
          fontFamily: "monospace",
          boxSizing: "border-box",
        }}
      />
    </div>
  )
}

function GroupSelect({ label, value, onChange, groupNames }) {
  return (
    <div style={{marginBottom: "0.35rem"}}>
      <label style={{fontSize: "0.7em", color: "var(--text-muted)", display: "block", marginBottom: "2px"}}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "var(--card-background)",
          color: "var(--text-color)",
          border: "1px solid var(--card-background)",
          borderRadius: "4px",
          padding: "4px 6px",
          fontSize: "0.8em",
          fontFamily: "monospace",
          boxSizing: "border-box",
        }}
      >
        <option value="">-- Select group --</option>
        {groupNames.map(name => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </div>
  )
}

function GroupMultiSelect({ label, values, onChange, groupNames, onEditGroup }) {
  function updateAt(i, val) {
    const next = [...values]
    next[i] = val
    onChange(next)
  }
  function removeAt(i) {
    const next = values.filter((_, idx) => idx !== i)
    if (next.length === 0) next.push("")
    onChange(next)
  }
  function addSlot() {
    onChange([...values, ""])
  }

  const selectStyle = {
    flex: 1,
    background: "var(--card-background)",
    color: "var(--text-color)",
    border: "1px solid var(--card-background)",
    borderRadius: "4px",
    padding: "4px 6px",
    fontSize: "0.8em",
    fontFamily: "monospace",
    boxSizing: "border-box",
  }

  return (
    <div style={{marginBottom: "0.35rem"}}>
      <label style={{fontSize: "0.7em", color: "var(--text-muted)", display: "block", marginBottom: "2px"}}>{label}</label>
      {values.map((v, i) => (
        <div key={i} style={{display: "flex", gap: "4px", marginBottom: "3px", alignItems: "center"}}>
          <select value={v} onChange={e => updateAt(i, e.target.value)} style={selectStyle}>
            <option value="">-- Select group --</option>
            {groupNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {onEditGroup && v && (
            <button
              onClick={() => onEditGroup(v)}
              title="Edit group"
              style={{
                background: "transparent", border: "none", color: "var(--text-muted)",
                cursor: "pointer", fontSize: "0.8em", lineHeight: "1", padding: "0 2px",
              }}
            >&#9998;</button>
          )}
          {values.length > 1 && (
            <button
              onClick={() => removeAt(i)}
              title="Remove"
              style={{
                background: "transparent", border: "none", color: "var(--text-muted)",
                cursor: "pointer", fontSize: "1em", lineHeight: "1", padding: "0 2px",
              }}
            >&times;</button>
          )}
        </div>
      ))}
      <button
        onClick={addSlot}
        style={{
          background: "transparent", border: "none", color: "var(--text-muted)",
          cursor: "pointer", fontSize: "0.75em", padding: "0",
        }}
      >+ Add group</button>
    </div>
  )
}

function ConditionTooltip({ children, conditions, style, onClick }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState(null)
  const timeoutRef = useRef(null)
  const elRef = useRef(null)
  function handleEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (elRef.current) {
      const rect = elRef.current.getBoundingClientRect()
      setPos({ top: rect.top + rect.height / 2, left: rect.right + 2 })
    }
    setShow(true)
  }
  function handleLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShow(false)
  }
  if (!conditions || conditions.length === 0) {
    return <div style={style} onClick={onClick}>{children}</div>
  }
  return (
    <div
      ref={elRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{...style, background: show ? "var(--table-row-hover)" : (style && style.background) || "transparent"}}
    >
      {children}
      {show && pos && ReactDOM.createPortal(
        <div style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          transform: "translateY(-50%)",
          background: "var(--card-background)",
          border: "1px solid var(--text-muted)",
          borderRadius: "6px",
          padding: "8px 12px",
          zIndex: 9999,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}>
          <div style={{fontSize: "11px", fontWeight: "bold", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px"}}>
            Matched Conditions
          </div>
          <table style={{borderCollapse: "collapse"}}>
            <tbody>
              {conditions.map((mc, i) => (
                <tr key={i}>
                  {mc.group != null && (
                    <td style={{
                      fontSize: "12px",
                      color: "var(--primary)",
                      fontWeight: "bold",
                      paddingRight: "10px",
                      paddingTop: "2px",
                      paddingBottom: "2px",
                      verticalAlign: "top",
                    }}>{mc.group}</td>
                  )}
                  <td style={{
                    fontSize: "12px",
                    fontFamily: "monospace",
                    color: "var(--white)",
                    paddingTop: "2px",
                    paddingBottom: "2px",
                  }}>{mc.condition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
        document.body,
      )}
    </div>
  )
}

function ClauseInputs({ label, connects, onChange, placeholder, highlightedConditions, onConditionClick }) {
  function updateAt(i, val) {
    const next = [...connects]
    next[i] = val
    onChange(next)
  }
  function removeAt(i) {
    const next = connects.filter((_, idx) => idx !== i)
    if (next.length === 0) next.push("")
    onChange(next)
  }
  function addClause() {
    onChange([...connects, ""])
  }
  return (
    <div style={{marginBottom: "0.35rem"}}>
      <label style={{fontSize: "0.7em", color: "var(--text-muted)", display: "block", marginBottom: "2px"}}>{label} (OR)</label>
      {connects.map((c, i) => {
        const trimmed = c.trim()
        const dimmed = highlightedConditions && trimmed && !highlightedConditions.has(trimmed)
        return (
          <div
            key={i}
            onClick={onConditionClick && trimmed ? () => onConditionClick(trimmed) : undefined}
            style={{
              display: "flex", gap: "4px", marginBottom: "3px", alignItems: "center",
              opacity: dimmed ? 0.3 : 1,
              cursor: onConditionClick && trimmed ? "pointer" : undefined,
              transition: "opacity 0.15s",
            }}
          >
            <input
              type="text"
              value={c}
              onChange={e => updateAt(i, e.target.value)}
              placeholder={placeholder}
              style={{
                flex: 1,
                background: "var(--card-background)",
                color: "var(--text-color)",
                border: "1px solid var(--card-background)",
                borderRadius: "4px",
                padding: "4px 6px",
                fontSize: "0.8em",
                fontFamily: "monospace",
                boxSizing: "border-box",
              }}
            />
            {connects.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); removeAt(i) }}
                title="Remove clause"
                style={{
                  background: "transparent", border: "none", color: "var(--text-muted)",
                  cursor: "pointer", fontSize: "1em", lineHeight: "1", padding: "0 2px",
                }}
              >&times;</button>
            )}
          </div>
        )
      })}
      <button
        onClick={addClause}
        style={{
          background: "transparent", border: "none", color: "var(--text-muted)",
          cursor: "pointer", fontSize: "0.75em", padding: "0",
        }}
      >+ Add OR clause</button>
    </div>
  )
}

function GroupCard({ group, index, unused, confirmDelete, onDeleteClick, onConfirmDelete, onCancelDelete, isEditing, onEditClick, onEditSave, onEditCancel, dimmed }) {
  const color = unused ? "var(--text-muted)" : ruleColor(index)

  if (isEditing) {
    return <GroupEditModal group={group} color={ruleColor(index)} onSave={onEditSave} onCancel={onEditCancel} />
  }

  return (
    <div onClick={onEditClick} style={{
      background: "var(--page-background)",
      borderRadius: "6px",
      padding: "0.4rem 0.7rem",
      marginBottom: "0.3rem",
      borderLeft: `3px solid ${color}`,
      opacity: dimmed ? 0.35 : unused ? 0.5 : 1,
      position: "relative",
      cursor: "pointer",
      transition: "opacity 0.15s",
    }}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <div style={{fontWeight: "bold", fontSize: "0.9em", color}}>
          {group.name || `Group ${index + 1}`}{unused ? " (unused)" : ""}
        </div>
        <div style={{display: "flex", gap: "4px"}}>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
            title="Delete group"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "1em",
              lineHeight: "1",
              padding: "0 2px",
            }}
          >
            &times;
          </button>
        </div>
      </div>
      {confirmDelete && (
        <div style={{
          background: "var(--card-background)",
          borderRadius: "4px",
          padding: "0.4rem 0.5rem",
          marginBottom: "0.35rem",
          fontSize: "0.75em",
        }}>
          <span style={{color: "#e55"}}>Delete this group?</span>
          <div style={{display: "flex", gap: "0.4rem", marginTop: "0.3rem"}}>
            <button onClick={onConfirmDelete} className="button" style={{fontSize: "0.75em", background: "#e55", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer"}}>Delete</button>
            <button onClick={onCancelDelete} className="button" style={{fontSize: "0.75em"}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupEditModal({ group, color, onSave, onCancel }) {
  const [editName, setEditName] = useState(group.name)
  const [editConditions, setEditConditions] = useState([...(group.conditions || [""])])
  const [matchedCards, setMatchedCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [highlightCondition, setHighlightCondition] = useState(null)
  const [highlightCard, setHighlightCard] = useState(null)
  const debounceRef = useRef(null)

  // Fetch matching cards whenever conditions change (debounced).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const conditions = editConditions.map(c => c.trim()).filter(c => c)
    if (conditions.length === 0) {
      setMatchedCards([])
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      fetch("/api/stats/design-graph/match", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ conditions }),
      })
        .then(r => r.json())
        .then(data => { setMatchedCards(data.cards || []); setLoading(false) })
        .catch(() => { setMatchedCards([]); setLoading(false) })
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [editConditions])

  // Clear highlights when conditions change.
  useEffect(() => {
    setHighlightCondition(null)
    setHighlightCard(null)
  }, [editConditions])

  // Close on Escape key.
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onCancel() }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onCancel])

  // Build the set of conditions that should be highlighted on the left side.
  // When a card is clicked, highlight the conditions it matched.
  const highlightedConditions = React.useMemo(() => {
    if (highlightCard) {
      const card = matchedCards.find(c => c.name === highlightCard)
      if (card) return new Set(card.conditions.map(mc => mc.condition))
    }
    if (highlightCondition) return new Set([highlightCondition])
    return null
  }, [highlightCard, highlightCondition, matchedCards])

  // Build the set of card names that should be highlighted on the right side.
  // When a condition is clicked, highlight the cards that matched it.
  const highlightedCards = React.useMemo(() => {
    if (highlightCondition) {
      const names = new Set()
      for (const card of matchedCards) {
        if (card.conditions.some(mc => mc.condition === highlightCondition)) names.add(card.name)
      }
      return names
    }
    if (highlightCard) return new Set([highlightCard])
    return null
  }, [highlightCondition, highlightCard, matchedCards])

  function handleConditionClick(cond) {
    setHighlightCard(null)
    setHighlightCondition(prev => prev === cond ? null : cond)
  }

  function handleCardClick(name) {
    setHighlightCondition(null)
    setHighlightCard(prev => prev === name ? null : name)
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--card-background)",
          borderRadius: "10px",
          border: `2px solid ${color}`,
          width: "min(1100px, 95vw)",
          height: "min(600px, 80vh)",
          display: "grid",
          gridTemplateColumns: "200px 1fr 1fr",
          overflow: "hidden",
        }}
      >
        {/* Left: query syntax reference */}
        <div style={{
          padding: "1rem",
          overflowY: "auto",
          background: "var(--page-background)",
          borderRight: "1px solid var(--card-background)",
          fontSize: "0.8em",
          lineHeight: "1.8",
        }}>
          <h4 style={{color: "var(--text-muted)", margin: "0 0 0.75rem 0", fontSize: "0.85rem"}}>
            Query Reference
          </h4>
          <table style={{borderCollapse: "collapse", width: "100%"}}>
            <tbody>
              {[
                ["n:", "name"],
                ["o:", "oracle text"],
                ["t:", "type"],
                ["st:", "subtype"],
                ["c:", "color (WUBRG)"],
                ["m:", "mana cost"],
                ["cmc:", "mana value"],
                ["is:", "keyword"],
              ].map(([prefix, desc]) => (
                <tr key={prefix}>
                  <td style={{color: "var(--primary)", fontFamily: "monospace", fontWeight: "bold", paddingRight: "8px", whiteSpace: "nowrap"}}>{prefix}</td>
                  <td style={{color: "var(--text-muted)"}}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{borderTop: "1px solid var(--card-background)", margin: "0.5rem 0", paddingTop: "0.5rem"}}>
            <div style={{color: "var(--text-muted)", marginBottom: "0.25rem", fontWeight: "bold", fontSize: "0.85em"}}>Comparisons</div>
            <div style={{color: "var(--text-muted)", fontFamily: "monospace"}}>
              cmc&lt;=N &nbsp; cmc&gt;=N<br/>
              pow&lt;=N &nbsp; tou&gt;=N
            </div>
          </div>
          <div style={{borderTop: "1px solid var(--card-background)", margin: "0.5rem 0", paddingTop: "0.5rem"}}>
            <div style={{color: "var(--text-muted)", marginBottom: "0.25rem", fontWeight: "bold", fontSize: "0.85em"}}>is: keywords</div>
            <div style={{color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.9em"}}>
              creature, land,<br/>
              removal, counterspell,<br/>
              interaction, handhate
            </div>
          </div>
          <div style={{borderTop: "1px solid var(--card-background)", margin: "0.5rem 0", paddingTop: "0.5rem"}}>
            <div style={{color: "var(--text-muted)", marginBottom: "0.25rem", fontWeight: "bold", fontSize: "0.85em"}}>Operators</div>
            <div style={{color: "var(--text-muted)", fontSize: "0.9em"}}>
              <code style={{color: "var(--primary)"}}>!</code> negate<br/>
              <code style={{color: "var(--primary)"}}>OR</code> disjunction<br/>
              <code style={{color: "var(--primary)"}}>()</code> grouping<br/>
              <code style={{color: "var(--primary)"}}>""</code> quoted phrase<br/>
              <code style={{color: "var(--primary)"}}>*</code> wildcard
            </div>
          </div>
        </div>

        {/* Center: edit form */}
        <div style={{
          padding: "1.25rem",
          overflowY: "auto",
          borderRight: "1px solid var(--page-background)",
          display: "flex",
          flexDirection: "column",
        }}>
          <h4 style={{color, margin: "0 0 1rem 0", fontSize: "1rem"}}>
            Edit Group
          </h4>
          <RuleInput label="Name" value={editName} onChange={setEditName} placeholder="e.g. Mill Enablers" />
          <div style={{flex: 1}}>
            <ClauseInputs
              label="Conditions" connects={editConditions}
              onChange={setEditConditions} placeholder="e.g. o:mill"
              highlightedConditions={highlightedConditions}
              onConditionClick={handleConditionClick}
            />
          </div>
          <div style={{display: "flex", gap: "0.5rem", marginTop: "1rem"}}>
            <button onClick={() => onSave({ name: editName, conditions: editConditions })} className="button" style={{fontSize: "0.85em"}}>Save</button>
            <button onClick={onCancel} className="button" style={{fontSize: "0.85em"}}>Cancel</button>
          </div>
        </div>

        {/* Right: matching cards preview */}
        <div style={{
          padding: "1.25rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}>
          <h4 style={{color: "var(--text-muted)", margin: "0 0 0.5rem 0", fontSize: "1rem"}}>
            Matching Cards
            <span style={{fontWeight: "normal", fontSize: "0.85em", marginLeft: "0.5rem"}}>
              {loading ? "..." : `(${matchedCards.length})`}
            </span>
          </h4>
          <div style={{flex: 1, overflowY: "auto"}}>
            {matchedCards.length === 0 && !loading && (
              <p style={{color: "var(--text-muted)", fontSize: "0.85em", fontStyle: "italic"}}>
                No matching cards.
              </p>
            )}
            {matchedCards.map(card => {
              const dimmed = highlightedCards && !highlightedCards.has(card.name)
              return (
                <ConditionTooltip
                  key={card.name}
                  conditions={card.conditions}
                  onClick={() => handleCardClick(card.name)}
                  style={{
                    fontSize: "0.8em",
                    color: "var(--text-color)",
                    padding: "2px 4px",
                    borderRadius: "3px",
                    cursor: "pointer",
                    opacity: dimmed ? 0.3 : 1,
                    transition: "opacity 0.15s",
                    background: highlightCard === card.name ? "var(--page-background)" : "transparent",
                  }}
                >
                  {card.name}
                </ConditionTooltip>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Resolve group names to their combined conditions, then fetch matching cards.
// Returns {cards: [{name, conditions: [{condition, group?}]}], loading}.
function useFetchGroupCards(selectedGroupNames, allGroups) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const names = (selectedGroupNames || []).filter(n => n)
    if (names.length === 0) { setCards([]); return }

    // Build parallel conditions and groups arrays so the backend can label each.
    const groupMap = {}
    for (const g of allGroups) groupMap[g.name] = g.conditions || []
    const conditions = []
    const groups = []
    for (const n of names) {
      for (const c of (groupMap[n] || [])) {
        conditions.push(c)
        groups.push(n)
      }
    }
    if (conditions.length === 0) { setCards([]); return }

    setLoading(true)
    debounceRef.current = setTimeout(() => {
      fetch("/api/stats/design-graph/match", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ conditions, groups }),
      })
        .then(r => r.json())
        .then(data => { setCards(data.cards || []); setLoading(false) })
        .catch(() => { setCards([]); setLoading(false) })
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [selectedGroupNames.join(","), allGroups])

  return { cards, loading }
}

function LinkEditModal({ link, color, groupNames, groups, onSave, onCancel, onGroupSaved }) {
  const [editLabel, setEditLabel] = useState(link.label || "")
  const [editSources, setEditSources] = useState([...(link.sources || [""])])
  const [editTargets, setEditTargets] = useState([...(link.targets || [""])])
  const [editingGroupName, setEditingGroupName] = useState(null)

  const sourceCards = useFetchGroupCards(editSources, groups)
  const targetCards = useFetchGroupCards(editTargets, groups)

  const editingGroup = editingGroupName ? groups.find(g => g.name === editingGroupName) : null
  const editingGroupIndex = editingGroupName ? groups.findIndex(g => g.name === editingGroupName) : -1

  // Close on Escape key.
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") {
        if (editingGroupName) setEditingGroupName(null)
        else onCancel()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onCancel, editingGroupName])

  function renderCardList(label, { cards, loading }) {
    return (
      <div style={{
        padding: "1.25rem",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}>
        <h4 style={{color: "var(--text-muted)", margin: "0 0 0.5rem 0", fontSize: "1rem"}}>
          {label}
          <span style={{fontWeight: "normal", fontSize: "0.85em", marginLeft: "0.5rem"}}>
            {loading ? "..." : `(${cards.length})`}
          </span>
        </h4>
        <div style={{flex: 1, overflowY: "auto"}}>
          {cards.length === 0 && !loading && (
            <p style={{color: "var(--text-muted)", fontSize: "0.85em", fontStyle: "italic"}}>
              No matching cards.
            </p>
          )}
          {cards.map(card => (
            <ConditionTooltip
              key={card.name}
              conditions={card.conditions && card.conditions.length > 0
                ? card.conditions
                : null}
              style={{
                fontSize: "0.8em",
                color: "var(--text-color)",
                padding: "2px 4px",
                borderRadius: "3px",
              }}
            >
              {card.name}
            </ConditionTooltip>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--card-background)",
          borderRadius: "10px",
          border: `2px solid ${color}`,
          width: "min(1100px, 95vw)",
          height: "min(600px, 80vh)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          overflow: "hidden",
        }}
      >
        {/* Left: source cards */}
        {renderCardList("Source Cards", sourceCards)}

        {/* Center: edit form */}
        <div style={{
          padding: "1.25rem",
          overflowY: "auto",
          borderLeft: "1px solid var(--page-background)",
          borderRight: "1px solid var(--page-background)",
          display: "flex",
          flexDirection: "column",
        }}>
          <h4 style={{color, margin: "0 0 1rem 0", fontSize: "1rem"}}>
            Edit Link
          </h4>
          <RuleInput label="Label" value={editLabel} onChange={setEditLabel} placeholder="e.g. Delve" />
          <GroupMultiSelect label="Sources" values={editSources} onChange={setEditSources} groupNames={groupNames} onEditGroup={setEditingGroupName} />
          <GroupMultiSelect label="Targets" values={editTargets} onChange={setEditTargets} groupNames={groupNames} onEditGroup={setEditingGroupName} />
          <div style={{flex: 1}} />
          <div style={{display: "flex", gap: "0.5rem", marginTop: "1rem"}}>
            <button onClick={() => onSave({ label: editLabel, sources: editSources, targets: editTargets })} className="button" style={{fontSize: "0.85em"}}>Save</button>
            <button onClick={onCancel} className="button" style={{fontSize: "0.85em"}}>Cancel</button>
          </div>
        </div>

        {/* Right: target cards */}
        {renderCardList("Target Cards", targetCards)}
      </div>

      {editingGroup && (
        <GroupEditModal
          group={editingGroup}
          color={ruleColor(editingGroupIndex)}
          onSave={(updated) => {
            if (onGroupSaved) {
              const oldName = editingGroup.name
              const newName = updated.name.trim() || "Untitled group"
              onGroupSaved(editingGroupIndex, updated)
              // Update local source/target references if name changed.
              if (oldName !== newName) {
                setEditSources(prev => prev.map(s => s === oldName ? newName : s))
                setEditTargets(prev => prev.map(t => t === oldName ? newName : t))
              }
            }
            setEditingGroupName(null)
          }}
          onCancel={() => setEditingGroupName(null)}
        />
      )}
    </div>
  )
}

function LinkCard({ link, index, groupNames, groups, confirmDelete, onDeleteClick, onConfirmDelete, onCancelDelete, isEditing, onEditClick, onEditSave, onEditCancel, onGroupSaved, dimmed }) {
  const color = ruleColor(index)

  if (isEditing) {
    return <LinkEditModal link={link} color={color} groupNames={groupNames} groups={groups} onSave={onEditSave} onCancel={onEditCancel} onGroupSaved={onGroupSaved} />
  }

  const sources = link.sources || []
  const targets = link.targets || []

  return (
    <div onClick={onEditClick} style={{
      background: "var(--page-background)",
      borderRadius: "6px",
      padding: "0.5rem 0.75rem",
      marginBottom: "0.5rem",
      borderLeft: `3px solid ${color}`,
      position: "relative",
      cursor: "pointer",
      opacity: dimmed ? 0.35 : 1,
      transition: "opacity 0.15s",
    }}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem"}}>
        <div style={{fontWeight: "bold", fontSize: "0.9em", color}}>
          {link.label || `Link ${index + 1}`}
        </div>
        <div style={{display: "flex", gap: "4px"}}>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
            title="Delete link"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "1em",
              lineHeight: "1",
              padding: "0 2px",
            }}
          >
            &times;
          </button>
        </div>
      </div>
      {confirmDelete && (
        <div style={{
          background: "var(--card-background)",
          borderRadius: "4px",
          padding: "0.4rem 0.5rem",
          marginBottom: "0.35rem",
          fontSize: "0.75em",
        }}>
          <span style={{color: "#e55"}}>Delete this link?</span>
          <div style={{display: "flex", gap: "0.4rem", marginTop: "0.3rem"}}>
            <button onClick={onConfirmDelete} className="button" style={{fontSize: "0.75em", background: "#e55", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer"}}>Delete</button>
            <button onClick={onCancelDelete} className="button" style={{fontSize: "0.75em"}}>Cancel</button>
          </div>
        </div>
      )}
      {sources.map((s, i) => (
        <div key={"s" + i} style={{fontSize: "0.75em", color: "var(--text-muted)"}}>
          <span style={{color: "var(--text-color)"}}>{i === 0 ? "source:" : "+"}</span> {s}
        </div>
      ))}
      {targets.map((t, i) => (
        <div key={"t" + i} style={{fontSize: "0.75em", color: "var(--text-muted)"}}>
          <span style={{color: "var(--text-color)"}}>{i === 0 ? "target:" : "+"}</span> {t}
        </div>
      ))}
    </div>
  )
}

const RULE_COLORS = [
  "#e6794a", "#4a9de6", "#5ec26a", "#c25ec2", "#e6c74a",
  "#4ae6d9", "#e64a6a", "#8a6ae6", "#6ae68a", "#e6a64a",
]

function ruleColor(index) {
  return RULE_COLORS[index % RULE_COLORS.length]
}

const DEFAULT_PHYSICS = {
  repulsion: 6000,
  attraction: 0.015,
  gravity: 0.001,
  damping: 0.92,
  maxFrames: 300,
}

function DesignMapGraph({ nodes, edges, links, onCardFocused, selectedLink, onSelectedLinkChanged, selectedCard, hoveredCard, onHoveredCardChanged }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const nodeIndexRef = useRef({})
  const animRef = useRef(null)
  const dragRef = useRef(null)
  const hoveredRef = useRef(null)
  const drawRef = useRef(null)
  const selectedLinkRef = useRef(null)
  const selectedCardRef = useRef(null)
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const panRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 600 })
  const [physics, setPhysics] = useState(DEFAULT_PHYSICS)
  const [showSettings, setShowSettings] = useState(false)

  // Resize canvas to fill container.
  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        if (w > 0) setCanvasSize({ width: w, height: Math.round(w * 0.65) })
      }
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  useEffect(() => {
    if (nodes.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const width = canvas.width
    const height = canvas.height

    // Build graph nodes. Size based on connection count.
    const maxConn = Math.max(...nodes.map(n => n.connection_count), 1)
    const graphNodes = nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length
      const radius = Math.min(width, height) * 0.45
      return {
        id: node.name,
        x: width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius: Math.max(4, Math.min(14, 3 + (node.connection_count / maxConn) * 11)),
        color: getNodeColor(node.colors),
        connectionCount: node.connection_count,
      }
    })

    // Build edges with rule label info for coloring.
    const graphEdges = edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      ruleLabels: edge.rule_labels || [],
    }))

    // Build a map from link label -> link index for coloring.
    const linkLabelIndex = {}
    for (let i = 0; i < links.length; i++) {
      linkLabelIndex[links[i].label] = i
    }

    const nodeIndex = {}
    for (let i = 0; i < graphNodes.length; i++) {
      nodeIndex[graphNodes[i].id] = i
    }

    nodesRef.current = graphNodes
    edgesRef.current = graphEdges
    nodeIndexRef.current = nodeIndex
    viewRef.current = { scale: 1, offsetX: 0, offsetY: 0 }

    let frame = 0
    const maxFrames = physics.maxFrames
    const damping = physics.damping

    function draw() {
      const v = viewRef.current
      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(v.offsetX, v.offsetY)
      ctx.scale(v.scale, v.scale)

      const hovered = hoveredRef.current
      const selLink = selectedLinkRef.current
      const selCard = selectedCardRef.current

      // Draw edges.
      for (const edge of graphEdges) {
        const si = nodeIndex[edge.source]
        const ti = nodeIndex[edge.target]
        if (si === undefined || ti === undefined) continue
        const s = graphNodes[si]
        const t = graphNodes[ti]

        // Determine if this edge should be dimmed.
        let dimmed = false
        if (selCard) {
          dimmed = edge.source !== selCard && edge.target !== selCard
        } else if (selLink === "unconnected") {
          dimmed = true
        } else if (selLink !== null) {
          dimmed = !edge.ruleLabels.includes(links[selLink]?.label)
        }

        // Color by primary link.
        let edgeColor
        if (edge.ruleLabels.length > 0) {
          const primaryIdx = linkLabelIndex[edge.ruleLabels[0]] ?? 0
          const c = RULE_COLORS[primaryIdx % RULE_COLORS.length]
          const alpha = dimmed ? 0.05 : Math.min(0.5, 0.1 + edge.weight * 0.1)
          edgeColor = hexToRGBA(c, alpha)
        } else {
          edgeColor = dimmed ? "rgba(255,255,255,0.02)" : `rgba(255,255,255,${Math.min(0.3, edge.weight * 0.05)})`
        }

        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.strokeStyle = edgeColor
        ctx.lineWidth = dimmed ? 0.3 : Math.max(0.5, Math.min(3, edge.weight * 0.5))
        ctx.stroke()
      }

      // Draw nodes.
      for (const node of graphNodes) {
        // Determine if this node should be dimmed.
        let dimmed = false
        if (selCard) {
          // Highlight selected card and its direct neighbors.
          const isNeighbor = graphEdges.some(e =>
            (e.source === selCard && e.target === node.id) ||
            (e.target === selCard && e.source === node.id)
          )
          dimmed = node.id !== selCard && !isNeighbor
        } else if (selLink === "unconnected") {
          dimmed = node.connectionCount > 0
        } else if (selLink !== null) {
          const linkLabel = links[selLink]?.label
          dimmed = !graphEdges.some(e =>
            (e.source === node.id || e.target === node.id) && e.ruleLabels.includes(linkLabel)
          )
        }

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI)
        ctx.fillStyle = dimmed ? "rgba(100,100,100,0.3)" : node.color
        ctx.fill()
        ctx.strokeStyle = hovered === node.id ? "#fff" : "rgba(0,0,0,0.5)"
        ctx.lineWidth = hovered === node.id ? 2 : 1
        ctx.stroke()
      }

      // Draw hovered node label.
      if (hovered) {
        const node = graphNodes.find(n => n.id === hovered)
        if (node) {
          const fontSize = Math.max(8, 13 / v.scale)
          ctx.font = `${fontSize}px monospace`
          ctx.fillStyle = "#fff"
          ctx.textAlign = "center"
          ctx.fillText(node.id, node.x, node.y - node.radius - 6 / v.scale)
        }
      }

      ctx.restore()
    }

    drawRef.current = draw

    const stepsPerFrame = 5

    function step() {
      if (frame > maxFrames) return
      frame++

      const alpha = 1 - frame / maxFrames

      // Repulsion between all node pairs.
      for (let i = 0; i < graphNodes.length; i++) {
        for (let j = i + 1; j < graphNodes.length; j++) {
          let dx = graphNodes[j].x - graphNodes[i].x
          let dy = graphNodes[j].y - graphNodes[i].y
          let dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < 20) dist = 20
          let force = (physics.repulsion * alpha) / (dist * dist)
          let fx = (dx / dist) * force
          let fy = (dy / dist) * force
          graphNodes[i].vx -= fx
          graphNodes[i].vy -= fy
          graphNodes[j].vx += fx
          graphNodes[j].vy += fy
        }
      }

      // Attraction along edges.
      for (const edge of graphEdges) {
        const si = nodeIndex[edge.source]
        const ti = nodeIndex[edge.target]
        if (si === undefined || ti === undefined) continue
        const s = graphNodes[si]
        const t = graphNodes[ti]
        let dx = t.x - s.x
        let dy = t.y - s.y
        let strength = physics.attraction * Math.min(edge.weight, 5) * alpha
        let fx = dx * strength
        let fy = dy * strength
        s.vx += fx
        s.vy += fy
        t.vx -= fx
        t.vy -= fy
      }

      // Center gravity.
      for (const node of graphNodes) {
        node.vx += (width / 2 - node.x) * physics.gravity * alpha
        node.vy += (height / 2 - node.y) * physics.gravity * alpha
      }

      // Apply velocities.
      const pad = 8
      for (const node of graphNodes) {
        if (dragRef.current && dragRef.current.id === node.id) continue
        node.vx *= damping
        node.vy *= damping
        node.x += node.vx
        node.y += node.vy
        node.x = Math.max(node.radius + pad, Math.min(width - node.radius - pad, node.x))
        node.y = Math.max(node.radius + pad, Math.min(height - node.radius - pad, node.y))
      }

      // Collision resolution: only kick in once layout has mostly settled (last 40% of sim).
      if (frame < maxFrames * 0.6) return
      const collisionPad = 6
      for (let i = 0; i < graphNodes.length; i++) {
        for (let j = i + 1; j < graphNodes.length; j++) {
          const a = graphNodes[i]
          const b = graphNodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
          const minDist = a.radius + b.radius + collisionPad
          if (dist < minDist) {
            const overlap = (minDist - dist) / 2
            const nx = dx / dist
            const ny = dy / dist
            if (!(dragRef.current && dragRef.current.id === a.id)) {
              a.x -= nx * overlap
              a.y -= ny * overlap
            }
            if (!(dragRef.current && dragRef.current.id === b.id)) {
              b.x += nx * overlap
              b.y += ny * overlap
            }
          }
        }
      }
    }

    function simulate() {
      if (frame > maxFrames) {
        draw()
        return
      }
      for (let s = 0; s < stepsPerFrame && frame <= maxFrames; s++) {
        step()
      }
      draw()
      animRef.current = requestAnimationFrame(simulate)
    }

    animRef.current = requestAnimationFrame(simulate)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      drawRef.current = null
    }
  }, [nodes, edges, links, canvasSize, physics])

  // Sync selectedLink state to ref for use in draw().
  useEffect(() => {
    selectedLinkRef.current = selectedLink
    if (drawRef.current) drawRef.current()
  }, [selectedLink])

  // Sync selectedCard state to ref for use in draw().
  useEffect(() => {
    selectedCardRef.current = selectedCard
    if (drawRef.current) drawRef.current()
  }, [selectedCard])

  // Sync external hoveredCard prop to ref for use in draw().
  useEffect(() => {
    if (hoveredCard !== hoveredRef.current) {
      hoveredRef.current = hoveredCard
      if (drawRef.current) drawRef.current()
    }
  }, [hoveredCard])

  // Convert screen coordinates (relative to canvas element) to world coordinates.
  function screenToWorld(sx, sy) {
    const canvas = canvasRef.current
    if (!canvas) return { x: sx, y: sy }
    // Account for CSS scaling (canvas pixel size vs display size).
    const rect = canvas.getBoundingClientRect()
    const cx = sx * (canvas.width / rect.width)
    const cy = sy * (canvas.height / rect.height)
    const v = viewRef.current
    return {
      x: (cx - v.offsetX) / v.scale,
      y: (cy - v.offsetY) / v.scale,
    }
  }

  function getNodeAt(wx, wy) {
    for (const node of nodesRef.current) {
      const dx = node.x - wx
      const dy = node.y - wy
      if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
        return node
      }
    }
    return null
  }

  function handleWheel(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    // Canvas pixel coords before zoom.
    const cx = sx * (canvas.width / rect.width)
    const cy = sy * (canvas.height / rect.height)

    const v = viewRef.current
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.max(0.2, Math.min(10, v.scale * zoomFactor))

    // Zoom toward cursor: adjust offset so the world point under cursor stays fixed.
    v.offsetX = cx - (cx - v.offsetX) * (newScale / v.scale)
    v.offsetY = cy - (cy - v.offsetY) * (newScale / v.scale)
    v.scale = newScale

    if (drawRef.current) drawRef.current()
  }

  // Attach wheel handler with { passive: false } to allow preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener("wheel", handleWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", handleWheel)
  }, [canvasSize])

  function handleMouseMove(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    // Handle panning (middle-click or drag on empty space with right mouse).
    if (panRef.current) {
      const v = viewRef.current
      const dx = (sx - panRef.current.sx) * (canvas.width / rect.width)
      const dy = (sy - panRef.current.sy) * (canvas.height / rect.height)
      v.offsetX = panRef.current.startOffsetX + dx
      v.offsetY = panRef.current.startOffsetY + dy
      if (drawRef.current) drawRef.current()
      return
    }

    const { x, y } = screenToWorld(sx, sy)

    if (dragRef.current) {
      dragRef.current.x = x
      dragRef.current.y = y
      dragRef.current.vx = 0
      dragRef.current.vy = 0
      if (drawRef.current) drawRef.current()
      return
    }

    const node = getNodeAt(x, y)
    const newHovered = node ? node.id : null
    if (newHovered !== hoveredRef.current) {
      hoveredRef.current = newHovered
      if (onHoveredCardChanged) onHoveredCardChanged(newHovered)
      if (drawRef.current) drawRef.current()
    }
    canvas.style.cursor = node ? "pointer" : "default"
  }

  function handleMouseDown(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x, y } = screenToWorld(sx, sy)
    const node = getNodeAt(x, y)
    if (node) {
      dragRef.current = node
    } else {
      // Start panning when clicking empty space.
      const v = viewRef.current
      panRef.current = { sx, sy, startOffsetX: v.offsetX, startOffsetY: v.offsetY }
    }
  }

  function handleMouseUp(e) {
    if (panRef.current) {
      panRef.current = null
      return
    }
    if (dragRef.current) {
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const { x, y } = screenToWorld(sx, sy)
        const node = getNodeAt(x, y)
        if (node && node.id === dragRef.current.id && onCardFocused) {
          onCardFocused(node.id)
        }
      }
      dragRef.current = null
      if (drawRef.current) drawRef.current()
    }
  }

  function handleMouseLeave() {
    dragRef.current = null
    panRef.current = null
    if (hoveredRef.current) {
      hoveredRef.current = null
      if (onHoveredCardChanged) onHoveredCardChanged(null)
      if (drawRef.current) drawRef.current()
    }
  }

  if (nodes.length === 0) {
    return (
      <div style={{textAlign: "center", padding: "2rem", color: "var(--text-muted)"}}>
        <p>No design graph data. Use the "+ Add Group" and "+ Add Link" buttons in the panel to define card associations.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{textAlign: "center"}}>
      <h4 style={{color: "var(--primary)", marginBottom: "0.5rem"}}>Design Map</h4>
      <p style={{color: "var(--text-muted)", fontSize: "0.85em", marginBottom: "0.5rem"}}>
        Group-based card associations. Node size = connection count. Edge color = link. Hover for name, click to select, drag to reposition.
      </p>
      <div style={{marginBottom: "0.5rem"}}>
        {links.map((link, i) => (
          <button
            key={i}
            onClick={() => onSelectedLinkChanged(selectedLink === i ? null : i)}
            style={{
              background: selectedLink === i ? ruleColor(i) : "transparent",
              color: selectedLink === i ? "#000" : ruleColor(i),
              border: `1px solid ${ruleColor(i)}`,
              borderRadius: "12px",
              padding: "2px 10px",
              margin: "2px",
              fontSize: "0.75em",
              cursor: "pointer",
            }}
          >
            {link.label || `Link ${i + 1}`}
          </button>
        ))}
        <button
          onClick={() => onSelectedLinkChanged(selectedLink === "unconnected" ? null : "unconnected")}
          style={{
            background: selectedLink === "unconnected" ? "var(--text-muted)" : "transparent",
            color: selectedLink === "unconnected" ? "#000" : "var(--text-muted)",
            border: "1px solid var(--text-muted)",
            borderRadius: "12px",
            padding: "2px 10px",
            margin: "2px",
            fontSize: "0.75em",
            cursor: "pointer",
          }}
        >
          Unconnected
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          border: "1px solid var(--card-background)",
          borderRadius: "8px",
          background: "var(--page-background)",
          width: "100%",
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      <div style={{textAlign: "left", marginTop: "0.5rem"}}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.75em",
            padding: 0,
          }}
        >
          {showSettings ? "- Hide Settings" : "+ Settings"}
        </button>
        {showSettings && (
          <PhysicsSettings physics={physics} onChange={setPhysics} />
        )}
      </div>
    </div>
  )
}

function PhysicsSettings({ physics, onChange }) {
  function set(key, value) {
    onChange({ ...physics, [key]: value })
  }

  const params = [
    { key: "repulsion", label: "Repulsion", min: 0, max: 10000, step: 100 },
    { key: "attraction", label: "Attraction", min: 0, max: 0.1, step: 0.001 },
    { key: "gravity", label: "Gravity", min: 0, max: 0.01, step: 0.0005 },
    { key: "damping", label: "Damping", min: 0.5, max: 0.99, step: 0.01 },
    { key: "maxFrames", label: "Sim Frames", min: 50, max: 1000, step: 50 },
  ]

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: "0.75rem",
      marginTop: "0.5rem",
      padding: "0.5rem 0",
    }}>
      {params.map(p => (
        <div key={p.key}>
          <label style={{fontSize: "0.7em", color: "var(--text-muted)", display: "block", marginBottom: "2px"}}>
            {p.label}
          </label>
          <input
            type="number"
            value={physics[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onChange={e => set(p.key, parseFloat(e.target.value) || 0)}
            style={{
              width: "100%",
              background: "var(--card-background)",
              color: "var(--text-color)",
              border: "1px solid var(--card-background)",
              borderRadius: "4px",
              padding: "3px 5px",
              fontSize: "0.75em",
              fontFamily: "monospace",
              boxSizing: "border-box",
            }}
          />
        </div>
      ))}
    </div>
  )
}

function ClusterCardList({ cards, edges, links, selectedCard, link, linkIndex, listLabel, onCardFocused, hoveredCard, onHoveredCardChanged }) {
  const title = link
    ? (link.label || `Link ${linkIndex + 1}`)
    : (listLabel || "All Cards")
  const titleColor = link ? ruleColor(linkIndex) : "var(--primary)"

  // Build a lookup: for the focused card, map each neighbor -> list of shared link labels.
  const sharedLinks = {}
  if (selectedCard && edges) {
    for (const edge of edges) {
      let neighbor = null
      if (edge.source === selectedCard) neighbor = edge.target
      else if (edge.target === selectedCard) neighbor = edge.source
      if (neighbor && neighbor !== selectedCard) {
        if (!sharedLinks[neighbor]) sharedLinks[neighbor] = []
        for (const label of (edge.rule_labels || [])) {
          if (!sharedLinks[neighbor].includes(label)) {
            sharedLinks[neighbor].push(label)
          }
        }
      }
    }
  }

  // Count edges per card.
  const edgeCount = {}
  if (edges) {
    for (const edge of edges) {
      edgeCount[edge.source] = (edgeCount[edge.source] || 0) + 1
      edgeCount[edge.target] = (edgeCount[edge.target] || 0) + 1
    }
  }

  return (
    <div style={{
      background: "var(--card-background)",
      borderRadius: "8px",
      padding: "0.75rem",
      overflowY: "auto",
      height: 0,
      minHeight: "100%",
    }}>
      <h5 style={{
        color: titleColor,
        margin: "0 0 0.5rem 0",
        fontSize: "0.9em",
      }}>
        {title}
      </h5>
      <p style={{color: "var(--text-muted)", fontSize: "0.75em", margin: "0 0 0.5rem 0"}}>
        {cards.length} cards
      </p>
      {cards.map(card => {
        const labels = sharedLinks[card.name]
        const isHovered = hoveredCard === card.name
        return (
          <div
            key={card.name}
            onClick={() => onCardFocused && onCardFocused(card.name)}
            onMouseEnter={() => onHoveredCardChanged && onHoveredCardChanged(card.name)}
            onMouseLeave={() => onHoveredCardChanged && onHoveredCardChanged(null)}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 6px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.8em",
              color: "var(--text-color)",
              background: isHovered ? "var(--page-background)" : "transparent",
            }}
          >
            <span style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: getNodeColor(card.colors),
              flexShrink: 0,
            }} />
            <span style={{overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1}}>
              {card.name}
            </span>
            {(edgeCount[card.name] || 0) > 0 && (
              <span style={{color: "var(--text-muted)", fontSize: "0.85em", flexShrink: 0}}>
                {edgeCount[card.name]}
              </span>
            )}
            {isHovered && labels && labels.length > 0 && (
              <div style={{
                position: "absolute",
                left: "16px",
                top: "100%",
                marginTop: "2px",
                background: "#222",
                border: "1px solid #555",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "0.85em",
                whiteSpace: "nowrap",
                zIndex: 100,
                pointerEvents: "none",
              }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.85em", marginBottom: "3px" }}>
                  Linked via:
                </div>
                {labels.map((label, i) => {
                  const li = links ? links.findIndex(l => l.label === label) : -1
                  return (
                    <div key={i} style={{ color: li >= 0 ? ruleColor(li) : "var(--text-color)", lineHeight: "1.4" }}>
                      {label}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function getNodeColor(colors) {
  if (!colors || colors.length === 0) return "#aaa"
  if (colors.length > 1) return "#daa520"
  switch (colors[0]) {
    case "W": return White
    case "U": return Blue
    case "B": return Black
    case "R": return Red
    case "G": return Green
    default: return "#aaa"
  }
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
