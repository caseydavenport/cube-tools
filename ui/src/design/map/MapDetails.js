// The Synergy map's detail panel: the overview, a group, or a card.

import React, { useMemo } from 'react'
import { UnstyledButton } from "@mantine/core"
import { cardRefName, effectiveCards, requestForConditions } from "../../utils/DesignRules.js"
import { useDesignMatch } from "../../utils/useDesignMatch.js"
import { getNodeColor } from "./ForceGraph.js"
import { ConditionTooltip } from "./RuleInputs.js"
import { useCardMemberships } from "./designData.js"
import { readableRuleColor, ruleColor } from "./ruleColors.js"

export function DetailPanel(props) {
  const { focus } = props
  if (focus.level === "card") return <CardDetail {...props} />
  if (focus.level === "group") return <GroupDetail {...props} />
  return <OverviewDetail {...props} />
}

function OverviewDetail({ groupNodes, links, nodeMap, onDrill }) {
  const themes = useMemo(() => groupNodes.filter(g => g.kind !== "card"), [groupNodes])
  const biggest = useMemo(
    () => [...themes].sort((a, b) => b.card_count - a.card_count).slice(0, 8),
    [themes],
  )
  const totalCards = Object.keys(nodeMap).length
  const unconnected = Object.values(nodeMap).filter(n => (n.connection_count || 0) === 0).length
  return (
    <div className="dm-panel dm-detail">
      <span className="section-heading">Overview</span>
      <div className="dm-statgrid">
        <Stat label="Themes" value={themes.length} />
        <Stat label="Links" value={links.length} />
        <Stat label="Cards" value={totalCards} />
        <Stat label="Unlinked" value={unconnected} />
      </div>
      <p className="dm-hint">Click a theme in the map or legend to drill in.</p>
      <div className="dm-subhead">Largest themes</div>
      <div className="dm-detail-list">
        {biggest.map(g => (
          <UnstyledButton key={g.name} className="dm-detail-row" onClick={() => onDrill({ level: "group", group: g.name })}>
            <span className="dm-legend-name">{g.name}</span>
            <span className="dm-legend-count">{g.card_count}</span>
          </UnstyledButton>
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
  const request = requestForConditions(group ? group.conditions : [], group ? group.name : null)
  const match = useDesignMatch(cube, request, { debounceMs: 200 })
  // The server marks the group's saved exclusions; hide those so the list
  // matches the group's card count.
  const cards = useMemo(() => effectiveCards(match.cards), [match.cards])
  const loading = match.loading
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
            {linkedGroups.map(lg => {
              // A card: ref links to a single card, not a group - color it like the
              // card and drill straight to card level.
              const cardName = cardRefName(lg.name)
              const color = cardName ? getNodeColor((nodeMap[cardName] || {}).colors) : groupColor(lg.name)
              return (
                <UnstyledButton
                  key={lg.name}
                  className="dm-chip"
                  style={{ borderColor: color, color: readableRuleColor(color) }}
                  title={"via " + lg.labels.join(", ")}
                  onClick={() => onDrill(cardName ? { level: "card", card: cardName } : { level: "group", group: lg.name })}
                >
                  {cardName || lg.name}
                </UnstyledButton>
              )
            })}
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
      // Skip neighbors cut from the cube; the editor is cube-only.
      if (!nodeMap[other]) continue
      for (const label of (e.rule_labels || ["(unlabeled)"])) {
        if (!map[label]) map[label] = new Set()
        map[label].add(other)
      }
    }
    return Object.entries(map)
      .map(([label, set]) => ({ label, cards: [...set].sort((a, b) => a.name?.localeCompare?.(b.name) ?? String(a).localeCompare(String(b))) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [edges, focus.card, nodeMap])

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
              <UnstyledButton
                key={m.name}
                className="dm-chip"
                style={{ borderColor: groupColor(m.name), color: readableRuleColor(groupColor(m.name)) }}
                title={m.conds.join(", ")}
                onClick={() => onDrill({ level: "group", group: m.name })}
              >
                {m.name}
              </UnstyledButton>
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
                <UnstyledButton
                  key={name}
                  className={"dm-detail-row" + (hovered === name ? " dm-legend-hot" : "")}
                  onMouseEnter={() => onHover(name)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onDrill({ level: "card", card: name })}
                >
                  <span className="dm-dot" style={{ background: getNodeColor(node.colors) }} />
                  <span className="dm-ellipsis">{name}</span>
                </UnstyledButton>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
