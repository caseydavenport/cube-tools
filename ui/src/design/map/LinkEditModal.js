// The dialog for editing one link's wires, with a group dialog on top of it
// for editing a group from inside a wire.

import React, { useState } from 'react'
import { Modal, Button, ActionIcon } from "@mantine/core"
import { IconPlus, IconX } from "@tabler/icons-react"
import { useFetchGroupCards } from "./designData.js"
import { ConditionTooltip, GroupMultiSelect, RuleInput } from "./RuleInputs.js"
import { GroupEditModal } from "./GroupEditModal.js"
import { ruleColor } from "./ruleColors.js"
import { MAP_COPY } from "./copy.js"

export function LinkEditModal({ link, color, groupNames, cardNames, groups, onSave, onCancel, onGroupSaved }) {
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
              {MAP_COPY.linkEdit.noMatchingCards}
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
                color: "var(--se-text)",
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

  // React passes key presses up the component tree, so Escape in the group
  // dialog would also reach this one. Only the top dialog should close.
  const closeOnEscape = editingGroupName === null

  return (
    <Modal opened onClose={onCancel} closeOnEscape={closeOnEscape} withCloseButton={false} centered size="auto" padding={0} radius="md">
      <div
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
        {renderCardList(editWires.length > 1 ? MAP_COPY.linkEdit.sourceCardsWire({ wire: activeWire + 1 }) : MAP_COPY.linkEdit.sourceCards, sourceCards)}

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
            {MAP_COPY.linkEdit.editLink}
          </h4>
          <RuleInput label={MAP_COPY.linkEdit.labelLabel} value={editLabel} onChange={setEditLabel} placeholder={MAP_COPY.linkEdit.labelPlaceholder} />
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
                    {MAP_COPY.linkEdit.wireTitle({ wire: wi + 1 })}
                  </span>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label={MAP_COPY.linkEdit.removeWire}
                    onClick={(e) => { e.stopPropagation(); removeWire(wi); }}
                    title={MAP_COPY.linkEdit.removeWire}
                  ><IconX size={14} /></ActionIcon>
                </div>
              )}
              <GroupMultiSelect label={MAP_COPY.linkEdit.sourcesLabel} values={w.sources} onChange={(v) => updateWire(wi, { sources: v })} groupNames={groupNames} cardNames={cardNames} onEditGroup={setEditingGroupName} />
              <GroupMultiSelect label={MAP_COPY.linkEdit.targetsLabel} values={w.targets} onChange={(v) => updateWire(wi, { targets: v })} groupNames={groupNames} cardNames={cardNames} onEditGroup={setEditingGroupName} />
            </div>
          ))}
          <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={addWire}>{MAP_COPY.linkEdit.addWire}</Button>
          <div style={{flex: 1}} />
          <div style={{display: "flex", gap: "0.5rem", marginTop: "1rem"}}>
            <Button size="xs" variant="filled" onClick={() => onSave({ label: editLabel, wires: editWires })}>{MAP_COPY.linkEdit.save}</Button>
            <Button size="xs" variant="default" onClick={onCancel}>{MAP_COPY.linkEdit.cancel}</Button>
          </div>
        </div>

        {/* Right: target cards (for the active wire) */}
        {renderCardList(editWires.length > 1 ? MAP_COPY.linkEdit.targetCardsWire({ wire: activeWire + 1 }) : MAP_COPY.linkEdit.targetCards, targetCards)}
      </div>

      {editingGroup && (
        <GroupEditModal
          group={editingGroup}
          color={ruleColor(editingGroupIndex)}
          onSave={(updated) => {
            if (onGroupSaved) {
              const oldName = editingGroup.name
              // copy-ok: the name saved into the rules file for a blank group
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
    </Modal>
  )
}
