// The dialog for editing one group: its name, conditions, and excluded cards.

import React, { useEffect, useState } from 'react'
import { Modal, Button, ActionIcon } from "@mantine/core"
import { IconArrowBackUp, IconX } from "@tabler/icons-react"
import { useCube } from "../../contexts/CubeContext.js"
import { requestForConditions } from "../../utils/DesignRules.js"
import { useDesignMatch } from "../../utils/useDesignMatch.js"
import { ClauseInputs, ConditionTooltip, ExcludeInputs, RuleInput } from "./RuleInputs.js"
import { TagPicker } from "./TagPicker.js"
import { SearchSyntax } from "../../search/SearchHelp.js"
import { addTagCondition } from "../../utils/tagOptions.js"
import { MAP_COPY } from "./copy.js"
import { useGroupCheck } from "../rules/GroupCheck.js"
import { checkRequest } from "../rules/groupCheckModel.js"
import { cleanGroup, withGroup } from "../rules/rulebookEdits.js"
import { PreviewLine, usePreview } from "../rulesPreview.js"
import "../rules/rules.css"
import "./map.css"

// PinnedCard says whether the card the group is being written for is in the
// group as it stands. result is the server's group check, null while loading.
function PinnedCard({ card, result }) {
  if (!result) {
    return <div className="group-pinned">Checking {card}…</div>
  }
  if (result.in_group) {
    return <div className="group-pinned group-pinned-yes">{card} matches</div>
  }
  return <div className="group-pinned">{card} doesn't match yet</div>
}

// GroupEditModal edits one group, showing live which cards its conditions
// match. pinnedCard, when set, is a card the group is being written for, and
// the dialog says whether it matches yet. rules, the saved { groups,
// packages }, turns on a preview of how the edit moves package build counts,
// over range ({ start, end }) when given.
export function GroupEditModal({ group, color, onSave, onCancel, pinnedCard, rules, range }) {
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

  // The pinned card is checked by the server, which knows cut cards the live
  // match above doesn't cover, and applies the unsaved exclude list.
  let pinnedBody = ""
  if (pinnedCard) {
    pinnedBody = checkRequest(pinnedCard, editName, editConditions, editExclude)
  }
  const pinned = useGroupCheck(cube, pinnedBody, 300)

  // The rule set this edit would save, for the preview, once the group has a
  // condition.
  let proposed = null
  const cleaned = cleanGroup({ name: editName, conditions: editConditions, exclude: editExclude, buildaround: group.buildaround, notBuildaround: group.notBuildaround })
  if (rules && cleaned) {
    proposed = withGroup(rules, group.name || "", cleaned)
  }
  const preview = usePreview(cube, proposed, range)

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
          background: "var(--se-card)",
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
        <div className="group-help-panel">
          <div className="group-help-section">
            <TagPicker cube={cube} onPick={slug => setEditConditions(prev => addTagCondition(prev, slug))} />
          </div>
          <SearchSyntax target="rules" compact />
        </div>

        {/* Center: edit form */}
        <div className="group-edit-panel">
          <h4 style={{color, margin: "0 0 1rem 0", fontSize: "1rem"}}>
            {MAP_COPY.groupEdit.editGroup}
          </h4>
          <RuleInput label={MAP_COPY.groupEdit.nameLabel} value={editName} onChange={setEditName} placeholder={MAP_COPY.groupEdit.namePlaceholder} />
          {pinnedCard && <PinnedCard card={pinnedCard} result={pinned} />}
          <div className="edit-modal-fill">
            <ClauseInputs
              label={MAP_COPY.groupEdit.conditionsLabel} connects={editConditions}
              onChange={setEditConditions} placeholder={MAP_COPY.groupEdit.conditionsPlaceholder}
              highlightedConditions={highlightedConditions}
              onConditionClick={handleConditionClick}
            />
            <ExcludeInputs values={editExclude} onChange={setEditExclude} options={excludeOptions} />
          </div>
          {proposed && <PreviewLine preview={preview} />}
          <div className="edit-modal-actions">
            <Button size="xs" variant="filled" onClick={() => onSave({ name: editName, conditions: editConditions, exclude: editExclude, buildaround: group.buildaround, notBuildaround: group.notBuildaround })}>{MAP_COPY.groupEdit.save}</Button>
            <Button size="xs" variant="default" onClick={onCancel}>{MAP_COPY.groupEdit.cancel}</Button>
          </div>
        </div>

        {/* Right: matching cards preview */}
        <div className="edit-modal-side-panel">
          <h4 className="edit-modal-heading">
            {MAP_COPY.groupEdit.matchingCards}
            <span className="edit-modal-count">
              {loading ? "..." : `(${matchedCards.length - excludedMatchCount})`}
              {!loading && excludedMatchCount > 0 && MAP_COPY.groupEdit.excludedCount({ count: excludedMatchCount })}
            </span>
            {addedSet.size > 0 && <span className="edit-modal-added">+{addedSet.size}</span>}
            {removedCards.length > 0 && <span className="edit-modal-removed">−{removedCards.length}</span>}
          </h4>
          <div className="edit-modal-list">
            {matchedCards.length === 0 && !loading && (
              <p className="edit-modal-empty">
                {MAP_COPY.groupEdit.noMatchingCards}
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
                    background: highlightCard === card.name ? "var(--se-page)" : "transparent",
                  }}
                >
                  <span style={{flex: 1, minWidth: 0, textDecoration: excluded ? "line-through" : "none"}}>{added ? `+ ${card.name}` : card.name}</span>
                  {excluded && <span className="de-excluded-tag">{MAP_COPY.groupEdit.excludedTag}</span>}
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label={excluded ? MAP_COPY.groupEdit.restoreToGroup : MAP_COPY.groupEdit.excludeFromGroup}
                    onClick={e => { e.stopPropagation(); toggleExclude(card.name) }}
                    title={excluded ? MAP_COPY.groupEdit.restoreToGroup : MAP_COPY.groupEdit.excludeFromGroup}
                  >{excluded ? <IconArrowBackUp size={14} /> : <IconX size={14} />}</ActionIcon>
                </ConditionTooltip>
              )
            })}
            {removedCards.map(name => (
              <div
                key={"rm-" + name}
                className="group-removed-item"
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
