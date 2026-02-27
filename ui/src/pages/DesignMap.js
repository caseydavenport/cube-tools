import React, { useRef, useEffect, useCallback, useState } from 'react'
import { White, Blue, Black, Red, Green } from "../utils/Colors.js"

export function DesignMapWidget({ show, designGraphData, onCardSelected, onRulesChanged }) {
  const [selectedRule, setSelectedRule] = useState(null)
  const [selectedCard, setSelectedCard] = useState(null)
  const [hoveredCard, setHoveredCard] = useState(null)

  if (!show) return null

  const data = designGraphData || {}
  const nodes = data.nodes || []
  const edges = data.edges || []
  const rules = data.rules || []

  // When selecting a rule, clear card selection and vice versa.
  function handleSelectRule(rule) {
    setSelectedRule(rule)
    setSelectedCard(null)
  }
  function handleSelectCard(cardName) {
    setSelectedCard(prev => prev === cardName ? null : cardName)
    setSelectedRule(null)
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
  } else if (selectedRule === "unconnected") {
    clusterCards = nodes.filter(n => n.connection_count === 0).sort((a, b) => a.name.localeCompare(b.name))
    listLabel = "Unconnected"
  } else if (selectedRule !== null && rules[selectedRule]) {
    const ruleLabel = rules[selectedRule].label
    const cardNames = new Set()
    for (const edge of edges) {
      if ((edge.rule_labels || []).includes(ruleLabel)) {
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
      <div style={{display: "grid", gridTemplateColumns: "600px 1fr 250px", gap: "1rem"}}>
        <RulesPanel rules={rules} nodes={nodes} edges={edges} onRulesChanged={onRulesChanged} />
        <DesignMapGraph
          nodes={nodes} edges={edges} rules={rules}
          onCardFocused={handleSelectCard}
          selectedRule={selectedRule} onSelectedRuleChanged={handleSelectRule}
          selectedCard={selectedCard}
          hoveredCard={hoveredCard} onHoveredCardChanged={setHoveredCard}
        />
        <ClusterCardList
          cards={clusterCards}
          edges={edges}
          rules={rules}
          selectedCard={selectedCard}
          rule={typeof selectedRule === "number" ? rules[selectedRule] : null}
          ruleIndex={typeof selectedRule === "number" ? selectedRule : null}
          listLabel={listLabel}
          onCardFocused={handleSelectCard}
          hoveredCard={hoveredCard}
          onHoveredCardChanged={setHoveredCard}
        />
      </div>
    </div>
  )
}

function saveRules(rules, onRulesChanged, onStatus) {
  fetch("/api/save-design-rules", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(rules),
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

function RulesPanel({ rules, nodes, edges, onRulesChanged }) {
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newMatch, setNewMatch] = useState([""])
  const [newConnect, setNewConnect] = useState([""])
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editing, setEditing] = useState(null)
  const [saveStatus, setSaveStatus] = useState("")

  function addRule() {
    const matchClauses = newMatch.map(c => c.trim()).filter(c => c)
    const connectClauses = newConnect.map(c => c.trim()).filter(c => c)
    if (matchClauses.length === 0 || connectClauses.length === 0) {
      setSaveStatus("At least one Match and one Connect clause are required.")
      return
    }
    const updated = [...rules, {
      label: newLabel.trim() || "Untitled rule",
      match: matchClauses,
      connect: connectClauses,
    }]
    saveRules(updated, onRulesChanged, setSaveStatus)
    setAdding(false)
    setNewLabel("")
    setNewMatch([""])
    setNewConnect([""])
  }

  function updateRule(index, updatedRule) {
    const matchClauses = updatedRule.match.map(c => c.trim()).filter(c => c)
    const connectClauses = updatedRule.connect.map(c => c.trim()).filter(c => c)
    if (matchClauses.length === 0 || connectClauses.length === 0) {
      setSaveStatus("At least one Match and one Connect clause are required.")
      return
    }
    const updated = rules.map((r, i) => i === index ? {
      label: updatedRule.label.trim() || "Untitled rule",
      match: matchClauses,
      connect: connectClauses,
    } : r)
    saveRules(updated, onRulesChanged, setSaveStatus)
    setEditing(null)
  }

  function deleteRule(index) {
    const updated = rules.filter((_, i) => i !== index)
    saveRules(updated, onRulesChanged, setSaveStatus)
    setConfirmDelete(null)
  }

  function cancelAdd() {
    setAdding(false)
    setNewLabel("")
    setNewMatch([""])
    setNewConnect([""])
    setSaveStatus("")
  }

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
        Design Rules
      </h4>

      <div style={{marginBottom: "0.75rem", borderBottom: "1px solid var(--page-background)", paddingBottom: "0.75rem"}}>
        <h5 style={{color: "var(--text-muted)", fontSize: "0.8em", margin: "0 0 0.5rem 0"}}>Query Syntax</h5>
        <div style={{color: "var(--text-muted)", fontSize: "0.75em", lineHeight: "1.6"}}>
          <code>n:</code> name &nbsp;
          <code>o:</code> oracle text &nbsp;
          <code>t:</code> type &nbsp;
          <code>st:</code> subtype &nbsp;
          <code>c:</code> color &nbsp;
          <code>cmc:</code> mana value &nbsp;
          <code>is:</code> creature, removal, etc.
          <br/>
          <code>cmc&lt;=N</code> <code>cmc&gt;=N</code> <code>pow&lt;=N</code> <code>tou&gt;=N</code>
          <br/>
          Negate with <code>!</code>: <code>!t:creature</code> <code>!c:R</code>
          <br/>
          Terms are AND. Use <code>OR</code> for disjunction.
          <br/>
          Parens for grouping: <code>(t:enchantment OR t:artifact) cmc&lt;=2</code>
          <br/>
          Quotes for phrases: <code>o:"enters the battlefield"</code>
        </div>
      </div>

      <p style={{color: "var(--text-muted)", fontSize: "0.8em", margin: "0 0 0.75rem 0"}}>
        {nodes.length} cards, {edges.length} edges from {rules.length} rules
      </p>

      {adding ? (
        <div style={{
          background: "var(--page-background)",
          borderRadius: "6px",
          padding: "0.5rem 0.75rem",
          marginBottom: "0.5rem",
          borderLeft: "3px solid var(--primary)",
        }}>
          <RuleInput label="Label" value={newLabel} onChange={setNewLabel} placeholder="e.g. Discard synergy" />
          <ClauseInputs
            label="Match" connects={newMatch}
            onChange={setNewMatch} placeholder="e.g. o:discard"
          />
          <ClauseInputs
            label="Connect" connects={newConnect}
            onChange={setNewConnect} placeholder="e.g. o:madness"
          />
          <div style={{display: "flex", gap: "0.5rem", marginTop: "0.5rem"}}>
            <button onClick={addRule} className="button" style={{fontSize: "0.8em"}}>Add</button>
            <button onClick={cancelAdd} className="button" style={{fontSize: "0.8em"}}>Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setSaveStatus("") }}
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
          + Add Rule
        </button>
      )}

      {saveStatus && (
        <p style={{color: "#e55", fontSize: "0.8em", margin: "0.25rem 0 0 0"}}>{saveStatus}</p>
      )}

      {rules.map((rule, i) => (
        <RuleCard
          key={i} rule={rule} index={i}
          confirmDelete={confirmDelete === i}
          onDeleteClick={() => setConfirmDelete(confirmDelete === i ? null : i)}
          onConfirmDelete={() => deleteRule(i)}
          onCancelDelete={() => setConfirmDelete(null)}
          isEditing={editing === i}
          onEditClick={() => { setEditing(editing === i ? null : i); setConfirmDelete(null); setSaveStatus("") }}
          onEditSave={(updated) => updateRule(i, updated)}
          onEditCancel={() => setEditing(null)}
        />
      ))}

      {rules.length === 0 && !adding && (
        <p style={{color: "var(--text-muted)", fontSize: "0.85em", fontStyle: "italic"}}>
          No rules defined yet.
        </p>
      )}

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

function ClauseInputs({ label, connects, onChange, placeholder }) {
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
      {connects.map((c, i) => (
        <div key={i} style={{display: "flex", gap: "4px", marginBottom: "3px", alignItems: "center"}}>
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
              onClick={() => removeAt(i)}
              title="Remove clause"
              style={{
                background: "transparent", border: "none", color: "var(--text-muted)",
                cursor: "pointer", fontSize: "1em", lineHeight: "1", padding: "0 2px",
              }}
            >&times;</button>
          )}
        </div>
      ))}
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

function RuleCard({ rule, index, confirmDelete, onDeleteClick, onConfirmDelete, onCancelDelete, isEditing, onEditClick, onEditSave, onEditCancel }) {
  const [editLabel, setEditLabel] = useState(rule.label)
  const [editMatch, setEditMatch] = useState(rule.match || [""])
  const [editConnect, setEditConnect] = useState(rule.connect || [""])

  // Reset edit fields when entering edit mode.
  useEffect(() => {
    if (isEditing) {
      setEditLabel(rule.label)
      setEditMatch([...(rule.match || [""])])
      setEditConnect([...(rule.connect || [""])])
    }
  }, [isEditing])

  if (isEditing) {
    return (
      <div style={{
        background: "var(--page-background)",
        borderRadius: "6px",
        padding: "0.5rem 0.75rem",
        marginBottom: "0.5rem",
        borderLeft: `3px solid ${ruleColor(index)}`,
      }}>
        <RuleInput label="Label" value={editLabel} onChange={setEditLabel} placeholder="e.g. Discard synergy" />
        <ClauseInputs
          label="Match" connects={editMatch}
          onChange={setEditMatch} placeholder="e.g. o:discard"
        />
        <ClauseInputs
          label="Connect" connects={editConnect}
          onChange={setEditConnect} placeholder="e.g. o:madness"
        />
        <div style={{display: "flex", gap: "0.5rem", marginTop: "0.5rem"}}>
          <button onClick={() => onEditSave({ label: editLabel, match: editMatch, connect: editConnect })} className="button" style={{fontSize: "0.8em"}}>Save</button>
          <button onClick={onEditCancel} className="button" style={{fontSize: "0.8em"}}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: "var(--page-background)",
      borderRadius: "6px",
      padding: "0.5rem 0.75rem",
      marginBottom: "0.5rem",
      borderLeft: `3px solid ${ruleColor(index)}`,
      position: "relative",
    }}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem"}}>
        <div style={{fontWeight: "bold", fontSize: "0.85em", color: ruleColor(index)}}>
          {rule.label || `Rule ${index + 1}`}
        </div>
        <div style={{display: "flex", gap: "4px"}}>
          <button
            onClick={onEditClick}
            title="Edit rule"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.8em",
              lineHeight: "1",
              padding: "0 2px",
            }}
          >
            &#9998;
          </button>
          <button
            onClick={onDeleteClick}
            title="Delete rule"
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
          <span style={{color: "#e55"}}>Delete this rule?</span>
          <div style={{display: "flex", gap: "0.4rem", marginTop: "0.3rem"}}>
            <button onClick={onConfirmDelete} className="button" style={{fontSize: "0.75em", background: "#e55", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer"}}>Delete</button>
            <button onClick={onCancelDelete} className="button" style={{fontSize: "0.75em"}}>Cancel</button>
          </div>
        </div>
      )}
      {(rule.match || []).map((m, mi) => (
        <div key={"m" + mi} style={{fontSize: "0.75em", color: "var(--text-muted)"}}>
          <span style={{color: "var(--text-color)"}}>{mi === 0 ? "match:" : "OR"}</span> {m}
        </div>
      ))}
      {(rule.connect || []).map((c, ci) => (
        <div key={ci} style={{fontSize: "0.75em", color: "var(--text-muted)"}}>
          <span style={{color: "var(--text-color)"}}>{ci === 0 ? "connect:" : "OR"}</span> {c}
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
  repulsion: 2000,
  attraction: 0.015,
  gravity: 0.001,
  damping: 0.92,
  maxFrames: 300,
}

function DesignMapGraph({ nodes, edges, rules, onCardFocused, selectedRule, onSelectedRuleChanged, selectedCard, hoveredCard, onHoveredCardChanged }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const nodeIndexRef = useRef({})
  const animRef = useRef(null)
  const dragRef = useRef(null)
  const hoveredRef = useRef(null)
  const drawRef = useRef(null)
  const selectedRuleRef = useRef(null)
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

    // Build a map from rule label -> rule index for coloring.
    const ruleLabelIndex = {}
    for (let i = 0; i < rules.length; i++) {
      ruleLabelIndex[rules[i].label] = i
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
      const selRule = selectedRuleRef.current
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
        } else if (selRule === "unconnected") {
          dimmed = true
        } else if (selRule !== null) {
          dimmed = !edge.ruleLabels.includes(rules[selRule]?.label)
        }

        // Color by primary rule.
        let edgeColor
        if (edge.ruleLabels.length > 0) {
          const primaryIdx = ruleLabelIndex[edge.ruleLabels[0]] ?? 0
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
        } else if (selRule === "unconnected") {
          dimmed = node.connectionCount > 0
        } else if (selRule !== null) {
          const ruleLabel = rules[selRule]?.label
          dimmed = !graphEdges.some(e =>
            (e.source === node.id || e.target === node.id) && e.ruleLabels.includes(ruleLabel)
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

    function simulate() {
      if (frame > maxFrames) {
        draw()
        return
      }
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

      draw()
      animRef.current = requestAnimationFrame(simulate)
    }

    animRef.current = requestAnimationFrame(simulate)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      drawRef.current = null
    }
  }, [nodes, edges, rules, canvasSize, physics])

  // Sync selectedRule state to ref for use in draw().
  useEffect(() => {
    selectedRuleRef.current = selectedRule
    if (drawRef.current) drawRef.current()
  }, [selectedRule])

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
        <p>No design graph data. Use the "+ Add Rule" button in the panel to define card associations.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{textAlign: "center"}}>
      <h4 style={{color: "var(--primary)", marginBottom: "0.5rem"}}>Design Map</h4>
      <p style={{color: "var(--text-muted)", fontSize: "0.85em", marginBottom: "0.5rem"}}>
        Rule-based card associations. Node size = connection count. Edge color = rule. Hover for name, click to select, drag to reposition.
      </p>
      <div style={{marginBottom: "0.5rem"}}>
        {rules.map((rule, i) => (
          <button
            key={i}
            onClick={() => onSelectedRuleChanged(selectedRule === i ? null : i)}
            style={{
              background: selectedRule === i ? ruleColor(i) : "transparent",
              color: selectedRule === i ? "#000" : ruleColor(i),
              border: `1px solid ${ruleColor(i)}`,
              borderRadius: "12px",
              padding: "2px 10px",
              margin: "2px",
              fontSize: "0.75em",
              cursor: "pointer",
            }}
          >
            {rule.label || `Rule ${i + 1}`}
          </button>
        ))}
        <button
          onClick={() => onSelectedRuleChanged(selectedRule === "unconnected" ? null : "unconnected")}
          style={{
            background: selectedRule === "unconnected" ? "var(--text-muted)" : "transparent",
            color: selectedRule === "unconnected" ? "#000" : "var(--text-muted)",
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

function ClusterCardList({ cards, edges, rules, selectedCard, rule, ruleIndex, listLabel, onCardFocused, hoveredCard, onHoveredCardChanged }) {
  const title = rule
    ? (rule.label || `Rule ${ruleIndex + 1}`)
    : (listLabel || "All Cards")
  const titleColor = rule ? ruleColor(ruleIndex) : "var(--primary)"

  // Build a lookup: for the focused card, map each neighbor -> list of shared rule labels.
  const sharedRules = {}
  if (selectedCard && edges) {
    for (const edge of edges) {
      let neighbor = null
      if (edge.source === selectedCard) neighbor = edge.target
      else if (edge.target === selectedCard) neighbor = edge.source
      if (neighbor && neighbor !== selectedCard) {
        if (!sharedRules[neighbor]) sharedRules[neighbor] = []
        for (const label of (edge.rule_labels || [])) {
          if (!sharedRules[neighbor].includes(label)) {
            sharedRules[neighbor].push(label)
          }
        }
      }
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
        const labels = sharedRules[card.name]
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
            <span style={{overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
              {card.name}
            </span>
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
                  const ri = rules ? rules.findIndex(r => r.label === label) : -1
                  return (
                    <div key={i} style={{ color: ri >= 0 ? ruleColor(ri) : "var(--text-color)", lineHeight: "1.4" }}>
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
