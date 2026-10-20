// The dialog for editing one group: its name, conditions, and excluded cards.

import React, { useEffect, useState } from 'react'
import { Modal, Button, ActionIcon } from "@mantine/core"
import { IconArrowBackUp, IconX } from "@tabler/icons-react"
import { useCube } from "../../contexts/CubeContext.js"
import { requestForConditions } from "../../utils/DesignRules.js"
import { useDesignMatch } from "../../utils/useDesignMatch.js"
import { ClauseInputs, ConditionTooltip, ExcludeInputs, RuleInput } from "./RuleInputs.js"

export function GroupEditModal({ group, color, onSave, onCancel }) {
  const cube = useCube()
  const [editName, setEditName] = useState(group.name)
  const [editConditions, setEditConditions] = useState([...(group.conditions || [""])])
  const [editExclude, setEditExclude] = useState([...(group.exclude || [])])
  const [highlightCondition, setHighlightCondition] = useState(null)
  const [highlightCard, setHighlightCard] = useState(null)

  // Live preview of the unsaved conditions. No group name is sent, so nothing is
  // marked excluded; the unsaved exclude list is applied below instead.
  const live = useDesignMatch(cube, requestForConditions(editConditions, null), { debounceMs: 300 })
  const matchedCards = live.cards
  const loading = live.loading

  // Baseline: the saved group's members, so the preview can mark adds and
  // removes. A brand-new group has an empty baseline, so every match reads as added.
  const saved = useDesignMatch(cube, requestForConditions(group.conditions, null))
  const baseline = React.useMemo(
    () => saved.loading ? null : new Set(saved.cards.map(c => c.name)),
    [saved.cards, saved.loading],
  )

  // Diff the live match against the baseline: added = now-matching but weren't;
  // removed = were matching but no longer are (so they aren't in matchedCards).
  const currentNames = React.useMemo(() => new Set(matchedCards.map(c => c.name)), [matchedCards])
  const addedSet = React.useMemo(
    () => baseline ? new Set([...currentNames].filter(n => !baseline.has(n))) : new Set(),
    [currentNames, baseline],
  )
  const removedCards = React.useMemo(
    () => baseline ? [...baseline].filter(n => !currentNames.has(n)).sort() : [],
    [baseline, currentNames],
  )

  // Clear highlights when conditions change.
  useEffect(() => {
    setHighlightCondition(null)
    setHighlightCard(null)
  }, [editConditions])

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

  const excludedSet = React.useMemo(() => new Set(editExclude.filter(n => n)), [editExclude])
  function toggleExclude(name) {
    setEditExclude(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev.filter(n => n), name])
  }

  // Picker options: matched cards plus any saved excludes that no longer match,
  // so a stale exclude stays visible and removable.
  const excludeOptions = React.useMemo(() => {
    const s = new Set(matchedCards.map(c => c.name))
    for (const n of editExclude) if (n) s.add(n)
    return [...s].sort()
  }, [matchedCards, editExclude])

  const excludedMatchCount = matchedCards.filter(c => excludedSet.has(c.name)).length

  return (
    <Modal opened onClose={onCancel} withCloseButton={false} centered size="auto" padding={0} radius="md">
      <div
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
            <ExcludeInputs values={editExclude} onChange={setEditExclude} options={excludeOptions} />
          </div>
          <div style={{display: "flex", gap: "0.5rem", marginTop: "1rem"}}>
            <Button size="xs" variant="filled" onClick={() => onSave({ name: editName, conditions: editConditions, exclude: editExclude })}>Save</Button>
            <Button size="xs" variant="default" onClick={onCancel}>Cancel</Button>
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
              {loading ? "..." : `(${matchedCards.length - excludedMatchCount})`}
              {!loading && excludedMatchCount > 0 && ` · ${excludedMatchCount} excluded`}
            </span>
            {addedSet.size > 0 && <span style={{fontSize: "0.85em", marginLeft: "0.5rem", color: "var(--se-good)"}}>+{addedSet.size}</span>}
            {removedCards.length > 0 && <span style={{fontSize: "0.85em", marginLeft: "0.35rem", color: "var(--se-bad)"}}>−{removedCards.length}</span>}
          </h4>
          <div style={{flex: 1, overflowY: "auto"}}>
            {matchedCards.length === 0 && !loading && (
              <p style={{color: "var(--text-muted)", fontSize: "0.85em", fontStyle: "italic"}}>
                No matching cards.
              </p>
            )}
            {matchedCards.map(card => {
              const dimmed = highlightedCards && !highlightedCards.has(card.name)
              const added = addedSet.has(card.name)
              const excluded = excludedSet.has(card.name)
              return (
                <ConditionTooltip
                  key={card.name}
                  conditions={card.conditions}
                  onClick={() => handleCardClick(card.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.8em",
                    color: added ? "var(--se-good)" : "var(--se-text)",
                    fontWeight: added ? 600 : "normal",
                    padding: "2px 4px",
                    borderRadius: "3px",
                    cursor: "pointer",
                    opacity: dimmed ? 0.3 : (excluded ? 0.45 : 1),
                    transition: "opacity 0.15s",
                    background: highlightCard === card.name ? "var(--page-background)" : "transparent",
                  }}
                >
                  <span style={{flex: 1, minWidth: 0, textDecoration: excluded ? "line-through" : "none"}}>{added ? `+ ${card.name}` : card.name}</span>
                  {excluded && <span className="de-excluded-tag">excluded</span>}
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label={excluded ? "Restore to group" : "Exclude from group"}
                    onClick={e => { e.stopPropagation(); toggleExclude(card.name) }}
                    title={excluded ? "Restore to group" : "Exclude from group"}
                  >{excluded ? <IconArrowBackUp size={14} /> : <IconX size={14} />}</ActionIcon>
                </ConditionTooltip>
              )
            })}
            {removedCards.map(name => (
              <div
                key={"rm-" + name}
                style={{
                  fontSize: "0.8em",
                  color: "var(--se-bad)",
                  textDecoration: "line-through",
                  padding: "2px 4px",
                }}
              >
                − {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
