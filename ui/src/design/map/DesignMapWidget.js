// The Synergy map page: the breadcrumb, the themes legend, the map, and the
// detail panel. The pieces live in the other files here.

import React, { useState, useMemo } from 'react'
import { Anchor, Breadcrumbs, SegmentedControl, Text, TextInput, UnstyledButton, useComputedColorScheme } from "@mantine/core"
import { IconSearch } from "@tabler/icons-react"
import { useCube } from "../../contexts/CubeContext.js"
import { ruleColor } from "./ruleColors.js"
import { useAllMemberships } from "./designData.js"
import { DrillMap } from "./DrillMap.js"
import { DetailPanel } from "./MapDetails.js"
import { MAP_COPY } from "./copy.js"
import "./map.css"

// The design map is a drill-in explorer. Focus is a stack of levels the user has
// drilled through, so the breadcrumb can climb back out:
//   themes            -> the whole set of groups (the overview constellation)
//   group:<name>      -> a single group's member cards
//   card:<name>       -> a card and its directly-linked neighbors
// Selecting anywhere (legend, map, detail rail) drives all three panels in sync.
export function DesignMapWidget({ show, designGraphData, cards, onCardSelected }) {
  const cube = useCube()

  // Reading the color scheme re-renders the panels when it changes, so the
  // color dots worked out while rendering pick up the new scheme.
  useComputedColorScheme("light")

  const [trail, setTrail] = useState([{ level: "themes" }])
  const [hovered, setHovered] = useState(null)

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
          <p>{MAP_COPY.widget.emptyTitle}</p>
          <p className="dm-muted">
            {MAP_COPY.widget.emptyHintBefore}<a className="dm-linkbtn" href={`#/${cube}/rules-editor`}>{MAP_COPY.widget.emptyHintLink}</a>{MAP_COPY.widget.emptyHintAfter}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dm-explore">
      <div className="dm-topbar">
        <Breadcrumb trail={trail} onCrumb={goToCrumb} groupColor={groupColor} />
      </div>

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
    </div>
  )
}

// --- Breadcrumb --------------------------------------------------------------

// Breadcrumb shows the drill-in path, "All themes" first, and climbs back to
// any earlier step when clicked. The current step is plain text, colored with
// its group's color when it's a group.
function Breadcrumb({ trail, onCrumb, groupColor }) {
  function label(step) {
    if (step.level === "themes") return MAP_COPY.widget.allThemes
    if (step.level === "group") return step.group
    return step.card
  }

  return (
    <Breadcrumbs className="dm-crumbs" separator="›" aria-label={MAP_COPY.widget.mapLocation}>
      {trail.map((step, i) => (
        <Crumb key={i} step={step} last={i === trail.length - 1} label={label(step)} onClick={() => onCrumb(i)} groupColor={groupColor} />
      ))}
    </Breadcrumbs>
  )
}

// Crumb is one breadcrumb step: a link back for earlier steps, plain text for
// the step the map is on.
function Crumb({ step, last, label, onClick, groupColor }) {
  if (!last) {
    return <Anchor component="button" type="button" size="sm" onClick={onClick}>{label}</Anchor>
  }

  let color = undefined
  if (step.level === "group") {
    color = groupColor(step.group)
  }
  return <Text size="sm" fw={600} c={color}>{label}</Text>
}

// --- Legend (searchable table of contents) -----------------------------------

function Legend({ groupNodes, groupColor, focus, hovered, onHover, onPick }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("size")

  // Card: wire refs show up as pseudo-groups on the map, but they aren't themes -
  // keep them out of the legend.
  const themes = useMemo(() => groupNodes.filter(g => g.kind !== "card"), [groupNodes])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = themes.filter(g => !q || g.name.toLowerCase().includes(q))
    out = [...out].sort((a, b) => sort === "name"
      ? a.name.localeCompare(b.name)
      : b.card_count - a.card_count)
    return out
  }, [themes, query, sort])

  const activeGroup = focus.level === "group" ? focus.group : null

  return (
    <div className="dm-panel dm-legend">
      <div className="dm-legend-head">
        <span className="section-heading dm-no-margin">{MAP_COPY.widget.themesHeading}</span>
        <span className="dm-count">{themes.length}</span>
      </div>
      <TextInput
        className="dm-search"
        size="xs"
        leftSection={<IconSearch size={14} />}
        placeholder={MAP_COPY.widget.filterPlaceholder}
        aria-label={MAP_COPY.widget.filterLabel}
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="dm-sortrow">
        <SegmentedControl
          size="xs"
          aria-label={MAP_COPY.widget.sortLabel}
          data={[{ value: "size", label: MAP_COPY.widget.sortSize }, { value: "name", label: MAP_COPY.widget.sortName }]}
          value={sort}
          onChange={setSort}
        />
      </div>
      <div className="dm-legend-list">
        {rows.map(g => {
          const on = activeGroup === g.name
          const hot = hovered === g.name
          return (
            <UnstyledButton
              key={g.name}
              className={"dm-legend-row" + (on ? " dm-legend-on" : "") + (hot ? " dm-legend-hot" : "")}
              onMouseEnter={() => onHover(g.name)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onPick(g.name)}
            >
              <span className="dm-swatch" style={{ background: groupColor(g.name) }} />
              <span className="dm-legend-name">{g.name}</span>
              <span className="dm-legend-count">{g.card_count}</span>
            </UnstyledButton>
          )
        })}
        {rows.length === 0 && <p className="dm-muted dm-pad">{MAP_COPY.widget.noThemesMatch}</p>}
      </div>
    </div>
  )
}
