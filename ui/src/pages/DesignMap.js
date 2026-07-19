import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { White, Blue, Black, Red, Green } from "../utils/Colors.js"
import { useCube } from "../contexts/CubeContext.js"

// The design map is a drill-in explorer. Focus is a stack of levels the user has
// drilled through, so the breadcrumb can climb back out:
//   themes            -> the whole set of groups (the overview constellation)
//   group:<name>      -> a single group's member cards
//   card:<name>       -> a card and its directly-linked neighbors
// Selecting anywhere (legend, map, detail rail) drives all three panels in sync.
export function DesignMapWidget({ show, designGraphData, cards, onCardSelected, onRulesChanged }) {
  const cube = useCube()
  const [trail, setTrail] = useState([{ level: "themes" }])
  const [hovered, setHovered] = useState(null)
  const [mode, setMode] = useState("explore")

  const data = designGraphData || {}
  const nodes = data.nodes || []
  const edges = data.edges || []
  const groups = data.groups || []
  const links = data.links || []
  const groupNodes = data.group_nodes || []
  // Wire the theme constellation from the rule-defined links (sparse, meaningful),
  // not from incidental card co-membership (near-complete graph, unreadable).
  const groupEdges = data.link_edges || []
  const dataKey = groupNodes.length

  // Memoized so that hovering a node - which re-renders this component - doesn't
  // hand the map freshly-built node/edge arrays and restart the force simulation.
  const nodeMap = useMemo(() => {
    const m = {}
    for (const n of nodes) m[n.name] = n
    return m
  }, [nodes])
  // Stable per-group color, shared by the legend swatches and the map nodes so a
  // theme reads the same everywhere.
  const groupColor = useMemo(() => {
    const idx = {}
    groupNodes.forEach((g, i) => { idx[g.name] = i })
    return (name) => ruleColor(idx[name] ?? 0)
  }, [groupNodes])

  // Every card's group memberships, so the map can explain exactly why two cards link.
  const cardGroups = useAllMemberships(cube, groups)

  // Full card data (image, oracle text) keyed by name, for the preview panel. The
  // graph nodes only carry name/colors/types, so pull the rest from the cube.
  const cardData = useMemo(() => {
    const m = {}
    for (const c of (cards || [])) m[c.name] = c
    return m
  }, [cards])

  if (!show) return null

  const focus = trail[trail.length - 1]

  function drillTo(step) {
    setTrail(prev => {
      // Re-clicking the current focus is a no-op; otherwise push a new level.
      const cur = prev[prev.length - 1]
      if (cur && cur.level === step.level && cur.group === step.group && cur.card === step.card) return prev
      return [...prev, step]
    })
  }
  function goToCrumb(i) {
    setTrail(prev => prev.slice(0, i + 1))
  }
  // Jumping to a theme from the legend resets the trail to that theme (a fresh dive).
  function jumpToGroup(name) {
    setTrail([{ level: "themes" }, { level: "group", group: name }])
  }

  if (groupNodes.length === 0) {
    return (
      <div className="dm-explore">
        <div className="dm-empty">
          <p>No design map yet.</p>
          <p className="dm-muted">
            Switch to <button className="dm-linkbtn" onClick={() => setMode("edit")}>Edit</button> to define
            groups (card queries) and links (how groups relate). The map is built from those rules.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dm-explore">
      <div className="dm-topbar">
        <Breadcrumb trail={trail} onCrumb={goToCrumb} groupColor={groupColor} />
        <div className="dm-modeswitch">
          {["explore", "edit"].map(m => (
            <button
              key={m}
              className={mode === m ? "dm-mode dm-mode-on" : "dm-mode"}
              onClick={() => setMode(m)}
            >
              {m === "explore" ? "Explore" : "Edit rules"}
            </button>
          ))}
        </div>
      </div>

      {mode === "edit" ? (
        <div className="dm-editwrap">
          <RulesPanel
            cube={cube} groups={groups} links={links} nodes={nodes} edges={edges}
            onRulesChanged={onRulesChanged} selectedCard={focus.level === "card" ? focus.card : null}
          />
        </div>
      ) : (
        <div className="dm-grid">
          <Legend
            groupNodes={groupNodes}
            groupColor={groupColor}
            focus={focus}
            hovered={hovered}
            onHover={setHovered}
            onPick={jumpToGroup}
          />
          <DrillMap
            key={dataKey}
            focus={focus}
            nodeMap={nodeMap}
            edges={edges}
            groupNodes={groupNodes}
            groupEdges={groupEdges}
            links={links}
            groupColor={groupColor}
            cardGroups={cardGroups}
            cardData={cardData}
            hovered={hovered}
            onHover={setHovered}
            onDrill={drillTo}
          />
          <DetailPanel
            cube={cube}
            focus={focus}
            groups={groups}
            groupNodes={groupNodes}
            links={links}
            edges={edges}
            nodeMap={nodeMap}
            groupColor={groupColor}
            hovered={hovered}
            onHover={setHovered}
            onDrill={drillTo}
          />
        </div>
      )}
    </div>
  )
}

// --- Breadcrumb --------------------------------------------------------------

function Breadcrumb({ trail, onCrumb, groupColor }) {
  function label(step) {
    if (step.level === "themes") return "All themes"
    if (step.level === "group") return step.group
    return step.card
  }
  return (
    <nav className="dm-crumbs" aria-label="Map location">
      {trail.map((step, i) => {
        const last = i === trail.length - 1
        const color = step.level === "group" ? groupColor(step.group) : "var(--primary)"
        return (
          <span key={i} className="dm-crumb-wrap">
            {i > 0 && <span className="dm-crumb-sep">›</span>}
            <button
              className={last ? "dm-crumb dm-crumb-current" : "dm-crumb"}
              style={last && step.level !== "themes" ? { color } : undefined}
              onClick={() => onCrumb(i)}
              disabled={last}
            >
              {label(step)}
            </button>
          </span>
        )
      })}
    </nav>
  )
}

// --- Legend (searchable table of contents) -----------------------------------

function Legend({ groupNodes, groupColor, focus, hovered, onHover, onPick }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("size")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = groupNodes.filter(g => !q || g.name.toLowerCase().includes(q))
    out = [...out].sort((a, b) => sort === "name"
      ? a.name.localeCompare(b.name)
      : b.card_count - a.card_count)
    return out
  }, [groupNodes, query, sort])

  const activeGroup = focus.level === "group" ? focus.group : null

  return (
    <div className="dm-panel dm-legend">
      <div className="dm-legend-head">
        <span className="section-heading" style={{ margin: 0 }}>Themes</span>
        <span className="dm-count">{groupNodes.length}</span>
      </div>
      <input
        className="dm-search"
        placeholder="Filter themes…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="dm-sortrow">
        {[["size", "Size"], ["name", "A–Z"]].map(([k, l]) => (
          <button key={k} className={sort === k ? "dm-sort dm-sort-on" : "dm-sort"} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>
      <div className="dm-legend-list">
        {rows.map(g => {
          const on = activeGroup === g.name
          const hot = hovered === g.name
          return (
            <button
              key={g.name}
              className={"dm-legend-row" + (on ? " dm-legend-on" : "") + (hot ? " dm-legend-hot" : "")}
              onMouseEnter={() => onHover(g.name)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onPick(g.name)}
            >
              <span className="dm-swatch" style={{ background: groupColor(g.name) }} />
              <span className="dm-legend-name">{g.name}</span>
              <span className="dm-legend-count">{g.card_count}</span>
            </button>
          )
        })}
        {rows.length === 0 && <p className="dm-muted dm-pad">No themes match.</p>}
      </div>
    </div>
  )
}

// --- Detail rail (the readable substance) ------------------------------------

// Fetch which cards match a set of conditions, each annotated with the condition(s)
// it matched - the "why" behind group membership.
function useMatchCards(cube, conditions, groups) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const key = (conditions || []).join("|") + "::" + (groups || []).join("|")
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const conds = (conditions || []).filter(c => c)
    if (conds.length === 0) { setCards([]); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/${cube}/stats/design-graph/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions: conds, groups: groups || [] }),
      })
        .then(r => r.json())
        .then(d => { setCards(d.cards || []); setLoading(false) })
        .catch(() => { setCards([]); setLoading(false) })
    }, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [cube, key])
  return { cards, loading }
}

// Fetch every card's group memberships once, each with the specific condition(s)
// that matched. Returns name -> [{ group, conds: [...] }]. Used to explain exactly
// why two cards are linked (which group each sits in, via which rule).
export function useAllMemberships(cube, groups) {
  const [map, setMap] = useState({})
  const key = (groups || []).map(g => g.name + ":" + (g.conditions || []).join(",")).join("|")
  useEffect(() => {
    const conditions = []
    const labels = []
    for (const g of (groups || [])) {
      for (const c of (g.conditions || [])) { conditions.push(c); labels.push(g.name) }
    }
    if (conditions.length === 0) { setMap({}); return }
    let alive = true
    fetch(`/api/${cube}/stats/design-graph/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conditions, groups: labels }),
    })
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const m = {}
        for (const card of (d.cards || [])) {
          const byGroup = {}
          for (const mc of card.conditions) {
            if (!mc.group) continue
            if (!byGroup[mc.group]) byGroup[mc.group] = []
            byGroup[mc.group].push(mc.condition)
          }
          m[card.name] = Object.entries(byGroup).map(([group, conds]) => ({ group, conds }))
        }
        setMap(m)
      })
      .catch(() => { if (alive) setMap({}) })
    return () => { alive = false }
  }, [cube, key])
  return map
}

// Explain why two cards are linked: for each rule connecting them, the specific
// group each card belongs to (and the condition that put it there).
export function whyLinked(focusCard, neighbor, edges, linkByLabel, cardGroups) {
  const labels = new Set()
  for (const e of edges) {
    const hit = (e.source === focusCard && e.target === neighbor) || (e.target === focusCard && e.source === neighbor)
    if (hit) for (const l of (e.rule_labels || [])) labels.add(l)
  }
  const fg = cardGroups[focusCard] || []
  const ng = cardGroups[neighbor] || []
  const groupConds = (mem, name) => { const g = mem.find(x => x.group === name); return g ? g.conds : [] }
  const out = []
  for (const label of labels) {
    const link = linkByLabel[label]
    const bridges = []
    if (link) {
      const seen = new Set()
      const add = (fGroup, nGroup) => {
        const k = fGroup + ">" + nGroup
        if (seen.has(k)) return
        seen.add(k)
        bridges.push({
          focusGroup: fGroup, neighGroup: nGroup,
          focusConds: groupConds(fg, fGroup), neighConds: groupConds(ng, nGroup),
        })
      }
      const fgNames = fg.map(x => x.group)
      const ngNames = ng.map(x => x.group)
      for (const wire of (link.wires || [])) {
        for (const s of (wire.sources || [])) {
          for (const t of (wire.targets || [])) {
            if (fgNames.includes(s) && ngNames.includes(t)) add(s, t)
            if (ngNames.includes(s) && fgNames.includes(t)) add(t, s)
          }
        }
      }
    }
    out.push({ label, bridges })
  }
  return out
}

function DetailPanel(props) {
  const { focus } = props
  if (focus.level === "card") return <CardDetail {...props} />
  if (focus.level === "group") return <GroupDetail {...props} />
  return <OverviewDetail {...props} />
}

function OverviewDetail({ groupNodes, links, nodeMap, onDrill }) {
  const biggest = useMemo(
    () => [...groupNodes].sort((a, b) => b.card_count - a.card_count).slice(0, 8),
    [groupNodes],
  )
  const totalCards = Object.keys(nodeMap).length
  const unconnected = Object.values(nodeMap).filter(n => (n.connection_count || 0) === 0).length
  return (
    <div className="dm-panel dm-detail">
      <span className="section-heading">Overview</span>
      <div className="dm-statgrid">
        <Stat label="Themes" value={groupNodes.length} />
        <Stat label="Links" value={links.length} />
        <Stat label="Cards" value={totalCards} />
        <Stat label="Unlinked" value={unconnected} />
      </div>
      <p className="dm-hint">Click a theme in the map or legend to drill in.</p>
      <div className="dm-subhead">Largest themes</div>
      <div className="dm-detail-list">
        {biggest.map(g => (
          <button key={g.name} className="dm-detail-row" onClick={() => onDrill({ level: "group", group: g.name })}>
            <span className="dm-legend-name">{g.name}</span>
            <span className="dm-legend-count">{g.card_count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="dm-stat">
      <div className="dm-stat-value">{value}</div>
      <div className="dm-stat-label">{label}</div>
    </div>
  )
}

function GroupDetail({ cube, focus, groups, groupNodes, links, groupColor, onDrill, onHover, hovered, nodeMap }) {
  const group = groups.find(g => g.name === focus.group)
  const gnode = groupNodes.find(g => g.name === focus.group)
  const { cards, loading } = useMatchCards(cube, group ? group.conditions : [], null)
  const color = groupColor(focus.group)

  // Which other groups this one links to, and via which link labels.
  const linkedGroups = useMemo(() => {
    const out = {}
    for (const l of links) {
      for (const w of (l.wires || [])) {
        const inSrc = (w.sources || []).includes(focus.group)
        const inTgt = (w.targets || []).includes(focus.group)
        if (!inSrc && !inTgt) continue
        const others = inSrc ? (w.targets || []) : (w.sources || [])
        for (const o of others) {
          if (o === focus.group) continue
          if (!out[o]) out[o] = new Set()
          out[o].add(l.label)
        }
      }
    }
    return Object.entries(out).map(([name, labels]) => ({ name, labels: [...labels] }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [links, focus.group])

  const sorted = useMemo(() => [...cards].sort((a, b) => a.name.localeCompare(b.name)), [cards])

  return (
    <div className="dm-panel dm-detail">
      <div className="dm-detail-title" style={{ color }}>
        <span className="dm-swatch dm-swatch-lg" style={{ background: color }} />
        {focus.group}
        <span className="dm-count">{gnode ? gnode.card_count : cards.length}</span>
      </div>

      {linkedGroups.length > 0 && (
        <>
          <div className="dm-subhead">Links to</div>
          <div className="dm-chiprow">
            {linkedGroups.map(lg => (
              <button
                key={lg.name}
                className="dm-chip"
                style={{ borderColor: groupColor(lg.name), color: groupColor(lg.name) }}
                title={"via " + lg.labels.join(", ")}
                onClick={() => onDrill({ level: "group", group: lg.name })}
              >
                {lg.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="dm-subhead">Cards {loading ? "…" : `(${sorted.length})`} <span className="dm-why-note">hover a card for why it matched</span></div>
      <div className="dm-detail-list">
        {sorted.map(c => {
          const node = nodeMap[c.name] || { colors: [] }
          return (
            <ConditionTooltip
              key={c.name}
              conditions={c.conditions}
              onClick={() => onDrill({ level: "card", card: c.name })}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "3px 6px", borderRadius: "4px", cursor: "pointer",
                fontSize: "0.85em",
                background: hovered === c.name ? "var(--page-background)" : "transparent",
              }}
            >
              <span
                onMouseEnter={() => onHover(c.name)}
                onMouseLeave={() => onHover(null)}
                style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}
              >
                <span className="dm-dot" style={{ background: getNodeColor(node.colors) }} />
                <span className="dm-ellipsis">{c.name}</span>
              </span>
            </ConditionTooltip>
          )
        })}
      </div>
    </div>
  )
}

// Fetch which groups a given card belongs to, with the condition(s) that matched.
function useCardMemberships(cube, cardName, groups) {
  const [memberships, setMemberships] = useState([])
  useEffect(() => {
    if (!cardName || !groups || groups.length === 0) { setMemberships([]); return }
    const conditions = []
    const groupLabels = []
    for (const g of groups) {
      for (const c of (g.conditions || [])) { conditions.push(c); groupLabels.push(g.name) }
    }
    if (conditions.length === 0) { setMemberships([]); return }
    let alive = true
    fetch(`/api/${cube}/stats/design-graph/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conditions, groups: groupLabels }),
    })
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const card = (d.cards || []).find(c => c.name === cardName)
        if (!card) { setMemberships([]); return }
        const byGroup = {}
        for (const mc of card.conditions) {
          if (!mc.group) continue
          if (!byGroup[mc.group]) byGroup[mc.group] = []
          byGroup[mc.group].push(mc.condition)
        }
        setMemberships(Object.entries(byGroup).map(([name, conds]) => ({ name, conds })))
      })
      .catch(() => { if (alive) setMemberships([]) })
    return () => { alive = false }
  }, [cube, cardName, groups])
  return memberships
}

function CardDetail({ cube, focus, groups, edges, links, nodeMap, groupColor, onDrill, onHover, hovered }) {
  const card = nodeMap[focus.card] || { name: focus.card, colors: [], types: [] }
  const memberships = useCardMemberships(cube, focus.card, groups)

  // Neighbors grouped by the rule label that connects them.
  const byRule = useMemo(() => {
    const map = {}
    for (const e of edges) {
      let other = null
      if (e.source === focus.card) other = e.target
      else if (e.target === focus.card) other = e.source
      if (!other) continue
      for (const label of (e.rule_labels || ["(unlabeled)"])) {
        if (!map[label]) map[label] = new Set()
        map[label].add(other)
      }
    }
    return Object.entries(map)
      .map(([label, set]) => ({ label, cards: [...set].sort((a, b) => a.name?.localeCompare?.(b.name) ?? String(a).localeCompare(String(b))) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [edges, focus.card])

  const linkIndex = {}
  links.forEach((l, i) => { linkIndex[l.label] = i })

  return (
    <div className="dm-panel dm-detail">
      <div className="dm-detail-title">
        <span className="dm-dot dm-dot-lg" style={{ background: getNodeColor(card.colors) }} />
        {card.name}
      </div>
      {card.types && card.types.length > 0 && (
        <div className="dm-types">{card.types.join(" · ")}{typeof card.cmc === "number" ? ` · ${card.cmc} MV` : ""}</div>
      )}

      {memberships.length > 0 && (
        <>
          <div className="dm-subhead">In themes</div>
          <div className="dm-chiprow">
            {memberships.map(m => (
              <button
                key={m.name}
                className="dm-chip"
                style={{ borderColor: groupColor(m.name), color: groupColor(m.name) }}
                title={m.conds.join(", ")}
                onClick={() => onDrill({ level: "group", group: m.name })}
              >
                {m.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="dm-subhead">Linked cards {byRule.length > 0 ? `(${new Set(byRule.flatMap(r => r.cards)).size})` : ""}</div>
      {byRule.length === 0 && <p className="dm-muted dm-pad">No links from this card.</p>}
      {byRule.map(r => {
        const li = linkIndex[r.label]
        const color = li != null ? ruleColor(li) : "var(--text-muted)"
        return (
          <div key={r.label} className="dm-rulegroup">
            <div className="dm-rulelabel" style={{ color }}>
              <span className="dm-swatch" style={{ background: color }} /> {r.label}
            </div>
            {r.cards.map(name => {
              const node = nodeMap[name] || { colors: [] }
              return (
                <button
                  key={name}
                  className={"dm-detail-row" + (hovered === name ? " dm-legend-hot" : "")}
                  onMouseEnter={() => onHover(name)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onDrill({ level: "card", card: name })}
                >
                  <span className="dm-dot" style={{ background: getNodeColor(node.colors) }} />
                  <span className="dm-ellipsis">{name}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// --- Drill map (the leveled constellation) -----------------------------------

function DrillMap({ focus, nodeMap, edges, groupNodes, groupEdges, links, groupColor, cardGroups, cardData, hovered, onHover, onDrill }) {
  const mapRef = useRef(null)
  const tipRef = useRef(null)
  const linkIndex = {}
  links.forEach((l, i) => { linkIndex[l.label] = i })
  const linkByLabel = {}
  links.forEach(l => { linkByLabel[l.label] = l })

  // At card level, hovering a neighbor explains exactly why it links to the focused
  // card: the specific rule, plus which group each card sits in and the condition
  // that matched. Recomputed only when the hovered neighbor changes.
  const why = useMemo(() => {
    if (focus.level !== "card" || !hovered || hovered === focus.card) return null
    const w = whyLinked(focus.card, hovered, edges, linkByLabel, cardGroups || {})
    return w.length > 0 ? w : null
  }, [focus, hovered, edges, cardGroups])

  // Position the tooltip at the cursor without re-rendering (avoids disturbing the sim).
  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    function move(e) {
      const tip = tipRef.current
      if (!tip) return
      const rect = el.getBoundingClientRect()
      let x = e.clientX - rect.left + 14
      let y = e.clientY - rect.top + 14
      // Keep the tooltip inside the map panel.
      const tw = tip.offsetWidth, th = tip.offsetHeight
      if (x + tw > rect.width) x = e.clientX - rect.left - tw - 14
      if (y + th > rect.height) y = Math.max(4, rect.height - th - 4)
      tip.style.left = x + "px"
      tip.style.top = y + "px"
    }
    el.addEventListener("mousemove", move)
    return () => el.removeEventListener("mousemove", move)
  }, [])

  // Build the node/edge set for the current drill level.
  const { simNodes, simEdges, showLabels, caption } = useMemo(() => {
    if (focus.level === "themes") {
      const max = groupNodes.reduce((m, g) => Math.max(m, g.card_count), 1)
      const sn = groupNodes.map(g => ({
        id: g.name,
        radius: Math.max(10, Math.min(38, 10 + (g.card_count / max) * 28)),
        color: groupColor(g.name),
        label: g.name,
        count: g.card_count,
      }))
      const se = groupEdges.map(e => ({
        source: e.source, target: e.target, weight: e.weight,
        color: edgeColorFor(e.labels, linkIndex),
      }))
      return { simNodes: sn, simEdges: se, showLabels: true, caption: `${sn.length} themes · click to drill in` }
    }

    if (focus.level === "group") {
      const g = groupNodes.find(x => x.name === focus.group)
      const names = new Set(g ? g.cards : [])
      const max = [...names].reduce((m, n) => Math.max(m, (nodeMap[n]?.connection_count) || 0), 1)
      const sn = [...names].map(n => {
        const c = nodeMap[n] || { colors: [], connection_count: 0 }
        return {
          id: n,
          radius: Math.max(6, Math.min(18, 6 + ((c.connection_count || 0) / max) * 12)),
          color: getNodeColor(c.colors),
          label: n,
        }
      })
      const se = edges
        .filter(e => names.has(e.source) && names.has(e.target))
        .map(e => ({ source: e.source, target: e.target, weight: e.weight, color: edgeColorFor(e.rule_labels, linkIndex) }))
      return { simNodes: sn, simEdges: se, showLabels: sn.length <= 34, caption: `${sn.length} cards in ${focus.group} · click a card` }
    }

    // card level: the focused card and its direct neighbors.
    const center = focus.card
    const nbrs = new Set([center])
    for (const e of edges) {
      if (e.source === center) nbrs.add(e.target)
      else if (e.target === center) nbrs.add(e.source)
    }
    const sn = [...nbrs].map(n => {
      const c = nodeMap[n] || { colors: [] }
      return {
        id: n,
        radius: n === center ? 16 : 9,
        color: getNodeColor(c.colors),
        label: n,
      }
    })
    const se = edges
      .filter(e => nbrs.has(e.source) && nbrs.has(e.target) && (e.source === center || e.target === center))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight, color: edgeColorFor(e.rule_labels, linkIndex) }))
    return { simNodes: sn, simEdges: se, showLabels: true, caption: `${sn.length - 1} cards linked to ${center}` }
  }, [focus, groupNodes, groupEdges, edges, nodeMap])

  return (
    <div className="dm-panel dm-map" ref={mapRef}>
      <ForceGraph
        nodes={simNodes}
        edges={simEdges}
        showLabels={showLabels}
        hoveredId={hovered}
        selectedId={focus.level === "card" ? focus.card : null}
        onHover={onHover}
        onSelect={(id) => {
          if (focus.level === "themes") onDrill({ level: "group", group: id })
          else onDrill({ level: "card", card: id })
        }}
      />
      <div className="dm-map-caption">{caption}</div>
      {(() => {
        // Preview the hovered card, or the focused card when nothing's hovered.
        const name = (hovered && cardData[hovered]) ? hovered : (focus.level === "card" ? focus.card : null)
        const card = name ? cardData[name] : null
        return card ? <CardPreview card={card} /> : null
      })()}
      {why && (
        <div ref={tipRef} className="dm-why-tip">
          <div className="dm-why-tip-head">
            <span className="dm-dot" style={{ background: getNodeColor((nodeMap[hovered] || {}).colors) }} />
            {hovered}
          </div>
          {why.map(w => (
            <div key={w.label} className="dm-why-rule">
              <div className="dm-why-rulelabel" style={{ color: ruleColor(linkIndex[w.label] ?? 0) }}>
                <span className="dm-swatch" style={{ background: ruleColor(linkIndex[w.label] ?? 0) }} /> {w.label}
              </div>
              {w.bridges.length === 0 && (
                <div className="dm-why-line dm-muted">shared rule</div>
              )}
              {w.bridges.map((b, i) => (
                <div key={i} className="dm-why-bridge">
                  <div className="dm-why-line">
                    <span className="dm-why-card">{focus.card}</span> in <b>{b.focusGroup}</b>
                    {b.focusConds[0] && <span className="dm-why-cond">{b.focusConds[0]}</span>}
                  </div>
                  <div className="dm-why-line">
                    <span className="dm-why-card">{hovered}</span> in <b>{b.neighGroup}</b>
                    {b.neighConds[0] && <span className="dm-why-cond">{b.neighConds[0]}</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// CardPreview overlays the hovered/selected card's actual image (or its rules text
// if no image is available) in the corner of the map.
function CardPreview({ card }) {
  if (!card) return null
  return (
    <div className="dm-preview">
      {card.image ? (
        <img className="dm-preview-img" src={card.image} alt={card.name} />
      ) : (
        <div className="dm-preview-text">
          <div className="dm-preview-name">{card.name} <span className="dm-preview-mana">{card.mana_cost}</span></div>
          <div className="dm-preview-type">{[...(card.types || []), ...(card.sub_types || [])].join(" ")}</div>
          <div className="dm-preview-oracle">{card.oracle_text}</div>
        </div>
      )}
    </div>
  )
}

function edgeColorFor(labels, linkIndex) {
  if (labels && labels.length > 0) {
    const idx = linkIndex[labels[0]] ?? 0
    return RULE_COLORS[idx % RULE_COLORS.length]
  }
  return null
}

export function saveDesignMap(cube, groups, links, onRulesChanged, onStatus) {
  fetch(`/api/${cube}/save-design-rules`, {
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

// Normalize a link's wires for saving: drop empty selector slots and fully
// blank wires. Returns null if no wires survive or any wire is one-sided.
export function cleanWires(rawWires) {
  const wires = []
  for (const w of (rawWires || [])) {
    const sources = (w.sources || []).filter(s => s)
    const targets = (w.targets || []).filter(t => t)
    if (sources.length === 0 && targets.length === 0) continue
    if (sources.length === 0 || targets.length === 0) return null
    wires.push({ sources, targets })
  }
  return wires.length > 0 ? wires : null
}

function RulesPanel({ cube, groups, links, nodes, edges, onRulesChanged, selectedCard, drawnConnection, onDrawnConnectionConsumed }) {
  const [activeTab, setActiveTab] = useState("links")
  const [addingGroup, setAddingGroup] = useState(false)
  const [addingLink, setAddingLink] = useState(false)
  // A pre-filled link draft opened by drawing a connection on the link graph.
  const [drawnLink, setDrawnLink] = useState(null)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null)
  const [confirmDeleteLink, setConfirmDeleteLink] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingLink, setEditingLink] = useState(null)
  const [saveStatus, setSaveStatus] = useState("")

  // When a connection is drawn on the graph, open a pre-filled link editor on the links tab.
  useEffect(() => {
    if (!drawnConnection) return
    setDrawnLink({ label: "", wires: [{ sources: [drawnConnection.source], targets: [drawnConnection.target] }] })
    setActiveTab("links")
    setSaveStatus("")
    if (onDrawnConnectionConsumed) onDrawnConnectionConsumed()
  }, [drawnConnection])

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
    saveDesignMap(cube, updated, links, onRulesChanged, setSaveStatus)
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
        wires: (l.wires || []).map(w => ({
          sources: (w.sources || []).map(s => s === oldName ? newName : s),
          targets: (w.targets || []).map(t => t === oldName ? newName : t),
        })),
      }))
    }
    saveDesignMap(cube, updatedGroups, updatedLinks, onRulesChanged, setSaveStatus)
    setEditingGroup(null)
  }

  function deleteGroup(index) {
    const updated = groups.filter((_, i) => i !== index)
    saveDesignMap(cube, updated, links, onRulesChanged, setSaveStatus)
    setConfirmDeleteGroup(null)
  }

  function addLink(newLink) {
    const wires = cleanWires(newLink.wires)
    if (!wires) {
      setSaveStatus("Every wire needs at least one source and one target group.")
      return false
    }
    const updated = [...links, {
      label: newLink.label.trim() || "Untitled link",
      wires,
    }]
    saveDesignMap(cube, groups, updated, onRulesChanged, setSaveStatus)
    setAddingLink(false)
    return true
  }

  function updateLink(index, updatedLink) {
    const wires = cleanWires(updatedLink.wires)
    if (!wires) {
      setSaveStatus("Every wire needs at least one source and one target group.")
      return
    }
    const updated = links.map((l, i) => i === index ? {
      label: updatedLink.label.trim() || "Untitled link",
      wires,
    } : l)
    saveDesignMap(cube, groups, updated, onRulesChanged, setSaveStatus)
    setEditingLink(null)
  }

  function deleteLink(index) {
    const updated = links.filter((_, i) => i !== index)
    saveDesignMap(cube, groups, updated, onRulesChanged, setSaveStatus)
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

    fetch(`/api/${cube}/stats/design-graph/match`, {
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
  const usedGroupNames = new Set(links.flatMap(l => (l.wires || []).flatMap(w => [...(w.sources || []), ...(w.targets || [])])))

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
        {drawnLink && (
          <LinkEditModal
            link={drawnLink}
            color="var(--primary)"
            groupNames={groupNames}
            groups={groups}
            onSave={(l) => { if (addLink(l)) setDrawnLink(null) }}
            onCancel={() => { setDrawnLink(null); setSaveStatus("") }}
          />
        )}
        {addingLink && (
          <LinkEditModal
            link={{ label: "", wires: [{ sources: [""], targets: [""] }] }}
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
      // Anchor the tooltip on whichever side has room. In the right-hand detail
      // rail there's no space to the right, so grow leftward instead of clipping.
      if (rect.right > window.innerWidth * 0.55) {
        setPos({ top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + 6 })
      } else {
        setPos({ top: rect.top + rect.height / 2, left: rect.right + 6 })
      }
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
          right: pos.right,
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

export function GroupEditModal({ group, color, onSave, onCancel }) {
  const cube = useCube()
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
      fetch(`/api/${cube}/stats/design-graph/match`, {
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
  const cube = useCube()
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
      fetch(`/api/${cube}/stats/design-graph/match`, {
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

export function LinkEditModal({ link, color, groupNames, groups, onSave, onCancel, onGroupSaved }) {
  const [editLabel, setEditLabel] = useState(link.label || "")
  const [editWires, setEditWires] = useState(() =>
    (link.wires && link.wires.length > 0 ? link.wires : [{ sources: [""], targets: [""] }])
      .map(w => ({
        sources: (w.sources && w.sources.length > 0) ? [...w.sources] : [""],
        targets: (w.targets && w.targets.length > 0) ? [...w.targets] : [""],
      })))
  // Which wire the flanking source/target card lists reflect.
  const [activeWire, setActiveWire] = useState(0)
  const [editingGroupName, setEditingGroupName] = useState(null)

  const wire = editWires[Math.min(activeWire, editWires.length - 1)] || { sources: [], targets: [] }
  const sourceCards = useFetchGroupCards(wire.sources, groups)
  const targetCards = useFetchGroupCards(wire.targets, groups)

  function updateWire(i, patch) {
    setEditWires(prev => prev.map((w, j) => j === i ? { ...w, ...patch } : w))
  }

  function addWire() {
    setEditWires(prev => [...prev, { sources: [""], targets: [""] }])
    setActiveWire(editWires.length)
  }

  function removeWire(i) {
    setEditWires(prev => prev.filter((_, j) => j !== i))
    setActiveWire(a => Math.min(a > i ? a - 1 : a, editWires.length - 2))
  }

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
        {/* Left: source cards (for the active wire) */}
        {renderCardList(editWires.length > 1 ? `Source Cards · Wire ${activeWire + 1}` : "Source Cards", sourceCards)}

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
          {editWires.map((w, wi) => (
            <div
              key={wi}
              onClick={() => setActiveWire(wi)}
              style={{
                border: `1px solid ${wi === activeWire ? color : "var(--page-background)"}`,
                borderRadius: "6px",
                padding: "0.5rem 0.6rem",
                marginBottom: "0.6rem",
                cursor: editWires.length > 1 ? "pointer" : "default",
              }}
            >
              {editWires.length > 1 && (
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem"}}>
                  <span style={{fontSize: "0.75em", fontWeight: "bold", color: wi === activeWire ? color : "var(--text-muted)"}}>
                    Wire {wi + 1}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeWire(wi); }}
                    title="Remove wire"
                    style={{background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1em", lineHeight: "1", padding: "0 2px"}}
                  >
                    &times;
                  </button>
                </div>
              )}
              <GroupMultiSelect label="Sources" values={w.sources} onChange={(v) => updateWire(wi, { sources: v })} groupNames={groupNames} onEditGroup={setEditingGroupName} />
              <GroupMultiSelect label="Targets" values={w.targets} onChange={(v) => updateWire(wi, { targets: v })} groupNames={groupNames} onEditGroup={setEditingGroupName} />
            </div>
          ))}
          <button onClick={addWire} className="button" style={{fontSize: "0.8em", alignSelf: "flex-start"}}>+ Add wire</button>
          <div style={{flex: 1}} />
          <div style={{display: "flex", gap: "0.5rem", marginTop: "1rem"}}>
            <button onClick={() => onSave({ label: editLabel, wires: editWires })} className="button" style={{fontSize: "0.85em"}}>Save</button>
            <button onClick={onCancel} className="button" style={{fontSize: "0.85em"}}>Cancel</button>
          </div>
        </div>

        {/* Right: target cards (for the active wire) */}
        {renderCardList(editWires.length > 1 ? `Target Cards · Wire ${activeWire + 1}` : "Target Cards", targetCards)}
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
              // Update local wire references if name changed.
              if (oldName !== newName) {
                setEditWires(prev => prev.map(w => ({
                  sources: w.sources.map(s => s === oldName ? newName : s),
                  targets: w.targets.map(t => t === oldName ? newName : t),
                })))
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

  const wires = link.wires || []

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
      {wires.map((w, i) => (
        <div key={"w" + i} style={{fontSize: "0.75em", color: "var(--text-muted)", marginTop: i > 0 ? "0.2rem" : 0}}>
          <span style={{color: "var(--text-color)"}}>{(w.sources || []).join(", ")}</span>
          {" → "}
          <span style={{color: "var(--text-color)"}}>{(w.targets || []).join(", ")}</span>
        </div>
      ))}
    </div>
  )
}

const RULE_COLORS = [
  "#e6794a", "#4a9de6", "#5ec26a", "#c25ec2", "#e6c74a",
  "#4ae6d9", "#e64a6a", "#8a6ae6", "#6ae68a", "#e6a64a",
]

export function ruleColor(index) {
  return RULE_COLORS[index % RULE_COLORS.length]
}

const DEFAULT_PHYSICS = {
  repulsion: 10000,
  attraction: 0.014,
  gravity: 0.0007,
  damping: 0.92,
  maxFrames: 340,
}

// ForceGraph is a small force-directed canvas renderer. It draws whatever nodes
// and edges it's handed - theme constellation, a group's cards, or a card's
// neighborhood - so every drill level shares one engine. Nodes: {id, radius,
// color, label, count?}. Edges: {source, target, weight, color?}.
function ForceGraph({ nodes, edges, showLabels, hoveredId, selectedId, onHover, onSelect }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const nodesRef = useRef([])
  const nodeIndexRef = useRef({})
  const adjacencyRef = useRef({})
  const animRef = useRef(null)
  const dragRef = useRef(null)
  const movedRef = useRef(false)
  const hoveredRef = useRef(null)
  const selectedRef = useRef(null)
  const drawRef = useRef(null)
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const panRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 620 })

  // Keep refs in step with props so the imperative draw loop sees current values.
  useEffect(() => { selectedRef.current = selectedId; if (drawRef.current) drawRef.current() }, [selectedId])
  useEffect(() => {
    if (hoveredId !== hoveredRef.current) { hoveredRef.current = hoveredId; if (drawRef.current) drawRef.current() }
  }, [hoveredId])

  // Fit the canvas to its column.
  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        const h = containerRef.current.clientHeight
        if (w > 0 && h > 0) setCanvasSize({ width: w, height: h })
      }
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext("2d")
    const width = canvas.width
    const height = canvas.height

    const graphNodes = nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length
      const r = Math.min(width, height) * 0.4
      return {
        id: node.id,
        x: width / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: height / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0,
        radius: node.radius, color: node.color, label: node.label, count: node.count,
      }
    })
    const nodeIndex = {}
    graphNodes.forEach((n, i) => { nodeIndex[n.id] = i })

    const graphEdges = edges
      .filter(e => nodeIndex[e.source] !== undefined && nodeIndex[e.target] !== undefined)
      .map(e => ({ source: e.source, target: e.target, weight: e.weight || 1, color: e.color }))

    const adjacency = {}
    for (const e of graphEdges) {
      (adjacency[e.source] = adjacency[e.source] || new Set()).add(e.target);
      (adjacency[e.target] = adjacency[e.target] || new Set()).add(e.source)
    }

    nodesRef.current = graphNodes
    nodeIndexRef.current = nodeIndex
    adjacencyRef.current = adjacency
    viewRef.current = { scale: 1, offsetX: 0, offsetY: 0 }

    const physics = DEFAULT_PHYSICS
    let frame = 0
    const maxFrames = physics.maxFrames

    function draw() {
      const v = viewRef.current
      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(v.offsetX, v.offsetY)
      ctx.scale(v.scale, v.scale)

      const hov = hoveredRef.current
      const sel = selectedRef.current
      const focusId = sel || hov
      const neighbors = focusId ? adjacencyRef.current[focusId] : null

      for (const edge of graphEdges) {
        const s = graphNodes[nodeIndex[edge.source]]
        const t = graphNodes[nodeIndex[edge.target]]
        const touches = focusId && (edge.source === focusId || edge.target === focusId)
        const dimmed = focusId && !touches
        const base = edge.color || "#7c8aa0"
        // At rest the web stays faint so the nodes read as a constellation; focusing a
        // node lights up just the edges that touch it.
        let alpha
        if (dimmed) alpha = 0.03
        else if (focusId) alpha = Math.min(0.75, 0.28 + edge.weight * 0.08)
        else alpha = Math.min(0.2, 0.03 + edge.weight * 0.022)
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.strokeStyle = hexToRGBA(base, alpha)
        ctx.lineWidth = (touches ? 1.6 : Math.max(0.5, Math.min(2.5, edge.weight * 0.4))) / v.scale
        ctx.stroke()
      }

      for (const node of graphNodes) {
        const isFocus = node.id === focusId
        const isNeighbor = neighbors && neighbors.has(node.id)
        const dimmed = focusId && !isFocus && !isNeighbor
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI)
        ctx.fillStyle = dimmed ? hexToRGBA(node.color, 0.18) : node.color
        ctx.fill()
        if (isFocus) {
          ctx.lineWidth = 2.5 / v.scale
          ctx.strokeStyle = "#f8fafc"
        } else {
          ctx.lineWidth = 1 / v.scale
          ctx.strokeStyle = dimmed ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.55)"
        }
        ctx.stroke()
      }

      // Labels: all of them when showLabels, otherwise just the focused/hovered one.
      const fontSize = Math.max(9, 12 / v.scale)
      ctx.font = `${fontSize}px Inter, sans-serif`
      ctx.textAlign = "center"
      ctx.lineJoin = "round"
      for (const node of graphNodes) {
        const isFocus = node.id === focusId
        const isNeighbor = neighbors && neighbors.has(node.id)
        const dimmed = focusId && !isFocus && !isNeighbor
        const show = isFocus || (showLabels && !dimmed) || (!showLabels && isFocus)
        if (!show) continue
        const text = node.count != null ? `${node.label} (${node.count})` : node.label
        const ty = node.y - node.radius - 5 / v.scale
        ctx.lineWidth = 3 / v.scale
        ctx.strokeStyle = "rgba(15,23,42,0.9)"
        ctx.strokeText(text, node.x, ty)
        ctx.fillStyle = isFocus ? "#f8fafc" : "rgba(226,232,240,0.85)"
        ctx.fillText(text, node.x, ty)
      }

      ctx.restore()
    }
    drawRef.current = draw

    function step() {
      if (frame > maxFrames) return
      frame++
      const alpha = 1 - frame / maxFrames
      for (let i = 0; i < graphNodes.length; i++) {
        for (let j = i + 1; j < graphNodes.length; j++) {
          let dx = graphNodes[j].x - graphNodes[i].x
          let dy = graphNodes[j].y - graphNodes[i].y
          let dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < 20) dist = 20
          const force = (physics.repulsion * alpha) / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          graphNodes[i].vx -= fx; graphNodes[i].vy -= fy
          graphNodes[j].vx += fx; graphNodes[j].vy += fy
        }
      }
      for (const edge of graphEdges) {
        const s = graphNodes[nodeIndex[edge.source]]
        const t = graphNodes[nodeIndex[edge.target]]
        const dx = t.x - s.x, dy = t.y - s.y
        const strength = physics.attraction * Math.min(edge.weight, 5) * alpha
        s.vx += dx * strength; s.vy += dy * strength
        t.vx -= dx * strength; t.vy -= dy * strength
      }
      for (const node of graphNodes) {
        node.vx += (width / 2 - node.x) * physics.gravity * alpha
        node.vy += (height / 2 - node.y) * physics.gravity * alpha
      }
      const pad = 8
      for (const node of graphNodes) {
        if (dragRef.current && dragRef.current.id === node.id) continue
        node.vx *= physics.damping; node.vy *= physics.damping
        node.x += node.vx; node.y += node.vy
        node.x = Math.max(node.radius + pad, Math.min(width - node.radius - pad, node.x))
        node.y = Math.max(node.radius + pad, Math.min(height - node.radius - pad, node.y))
      }
      if (frame < maxFrames * 0.6) return
      const cpad = 6
      for (let i = 0; i < graphNodes.length; i++) {
        for (let j = i + 1; j < graphNodes.length; j++) {
          const a = graphNodes[i], b = graphNodes[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
          const minDist = a.radius + b.radius + cpad
          if (dist < minDist) {
            const overlap = (minDist - dist) / 2
            const nx = dx / dist, ny = dy / dist
            if (!(dragRef.current && dragRef.current.id === a.id)) { a.x -= nx * overlap; a.y -= ny * overlap }
            if (!(dragRef.current && dragRef.current.id === b.id)) { b.x += nx * overlap; b.y += ny * overlap }
          }
        }
      }
    }

    function simulate() {
      if (frame > maxFrames) { draw(); return }
      for (let s = 0; s < 5 && frame <= maxFrames; s++) step()
      draw()
      animRef.current = requestAnimationFrame(simulate)
    }
    animRef.current = requestAnimationFrame(simulate)

    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); drawRef.current = null }
  }, [nodes, edges, canvasSize, showLabels])

  function screenToWorld(sx, sy) {
    const canvas = canvasRef.current
    if (!canvas) return { x: sx, y: sy }
    const rect = canvas.getBoundingClientRect()
    const cx = sx * (canvas.width / rect.width)
    const cy = sy * (canvas.height / rect.height)
    const v = viewRef.current
    return { x: (cx - v.offsetX) / v.scale, y: (cy - v.offsetY) / v.scale }
  }
  function nodeAt(wx, wy) {
    for (const node of nodesRef.current) {
      const dx = node.x - wx, dy = node.y - wy
      if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) return node
    }
    return null
  }

  function handleWheel(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width)
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height)
    const v = viewRef.current
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.max(0.3, Math.min(6, v.scale * factor))
    v.offsetX = cx - (cx - v.offsetX) * (newScale / v.scale)
    v.offsetY = cy - (cy - v.offsetY) * (newScale / v.scale)
    v.scale = newScale
    if (drawRef.current) drawRef.current()
  }
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
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    if (panRef.current) {
      const v = viewRef.current
      v.offsetX = panRef.current.startOffsetX + (sx - panRef.current.sx) * (canvas.width / rect.width)
      v.offsetY = panRef.current.startOffsetY + (sy - panRef.current.sy) * (canvas.height / rect.height)
      movedRef.current = true
      if (drawRef.current) drawRef.current()
      return
    }
    const { x, y } = screenToWorld(sx, sy)
    if (dragRef.current) {
      dragRef.current.x = x; dragRef.current.y = y
      dragRef.current.vx = 0; dragRef.current.vy = 0
      movedRef.current = true
      if (drawRef.current) drawRef.current()
      return
    }
    const node = nodeAt(x, y)
    const id = node ? node.id : null
    if (id !== hoveredRef.current) {
      hoveredRef.current = id
      if (onHover) onHover(id)
      if (drawRef.current) drawRef.current()
    }
    canvas.style.cursor = node ? "pointer" : "grab"
  }
  function handleMouseDown(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const { x, y } = screenToWorld(sx, sy)
    const node = nodeAt(x, y)
    movedRef.current = false
    if (node) dragRef.current = node
    else {
      const v = viewRef.current
      panRef.current = { sx, sy, startOffsetX: v.offsetX, startOffsetY: v.offsetY }
    }
  }
  function handleMouseUp(e) {
    if (dragRef.current) {
      const node = dragRef.current
      dragRef.current = null
      if (!movedRef.current && onSelect) onSelect(node.id)
      if (drawRef.current) drawRef.current()
    }
    panRef.current = null
  }
  function handleMouseLeave() {
    dragRef.current = null
    panRef.current = null
    if (hoveredRef.current) {
      hoveredRef.current = null
      if (onHover) onHover(null)
      if (drawRef.current) drawRef.current()
    }
  }

  return (
    <div ref={containerRef} className="dm-canvaswrap">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  )
}

export function getNodeColor(colors) {
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
