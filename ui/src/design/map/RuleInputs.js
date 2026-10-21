// The inputs the group and link dialogs share: a rule text box, group
// pickers, OR clauses, excluded cards, and the why-it-matched tooltip.

import React, { useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { NativeSelect, TextInput, Button, ActionIcon } from "@mantine/core"
import { IconPencil, IconPlus, IconX } from "@tabler/icons-react"
import { CARD_REF_PREFIX, cardRefName } from "../../utils/DesignRules.js"
import { MAP_COPY } from "./copy.js"
import "./map.css"

// RuleInput is a labeled text box for one part of a rule, such as a group's
// name, in the monospace face the rule syntax reads best in.
export function RuleInput({ label, value, onChange, placeholder }) {
  return (
    <TextInput
      size="xs"
      mb={6}
      label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      classNames={{ input: "dm-mono" }}
    />
  )
}

export function GroupMultiSelect({ label, values, onChange, groupNames, cardNames, onEditGroup }) {
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

  return (
    <div className="rule-input-field">
      <label className="rule-input-label">{label}</label>
      {values.map((v, i) => (
        <div key={i} className="rule-input-row">
          <NativeSelect size="xs" className="dm-grow" classNames={{ input: "dm-mono" }} aria-label={label} value={v} onChange={e => updateAt(i, e.target.value)}>
            <option value="">{cardNames ? MAP_COPY.ruleInputs.selectGroupOrCard : MAP_COPY.ruleInputs.selectGroup}</option>
            <optgroup label={MAP_COPY.ruleInputs.groupsOption}>
              {groupNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </optgroup>
            {cardNames && cardNames.length > 0 && (
              <optgroup label={MAP_COPY.ruleInputs.cardsOption}>
                {cardNames.map(name => (
                  <option key={CARD_REF_PREFIX + name} value={CARD_REF_PREFIX + name}>{name}</option>
                ))}
              </optgroup>
            )}
          </NativeSelect>
          {onEditGroup && v && !cardRefName(v) && (
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={MAP_COPY.ruleInputs.editGroup}
              onClick={() => onEditGroup(v)}
              title={MAP_COPY.ruleInputs.editGroup}
            ><IconPencil size={14} /></ActionIcon>
          )}
          {values.length > 1 && (
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={MAP_COPY.ruleInputs.remove}
              onClick={() => removeAt(i)}
              title={MAP_COPY.ruleInputs.remove}
            ><IconX size={14} /></ActionIcon>
          )}
        </div>
      ))}
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconPlus size={12} />}
        onClick={addSlot}
      >{MAP_COPY.ruleInputs.addGroup}</Button>
    </div>
  )
}

export function ConditionTooltip({ children, conditions, style, className, onClick }) {
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
    return <div className={className} style={style} onClick={onClick}>{children}</div>
  }
  return (
    <div
      ref={elRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={onClick}
      className={className}
      style={{...style, background: show ? "color-mix(in srgb, var(--se-border) 60%, var(--se-card))" : (style && style.background) || "transparent"}}
    >
      {children}
      {show && pos && ReactDOM.createPortal(
        <div style={{
          position: "fixed",
          left: pos.left,
          right: pos.right,
          top: pos.top,
          transform: "translateY(-50%)",
          background: "var(--se-card)",
          border: "1px solid var(--se-muted)",
          borderRadius: "6px",
          padding: "8px 12px",
          zIndex: 9999,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          boxShadow: "var(--mantine-shadow-md)",
        }}>
          <div className="rule-summary-heading">
            {MAP_COPY.ruleInputs.matchedConditions}
          </div>
          <table className="rule-summary-table">
            <tbody>
              {conditions.map((mc, i) => (
                <tr key={i}>
                  {mc.group != null && (
                    <td className="rule-summary-key">{mc.group}</td>
                  )}
                  <td className="rule-summary-value">{mc.condition}</td>
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

export function ClauseInputs({ label, connects, onChange, placeholder, highlightedConditions, onConditionClick }) {
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
    <div className="rule-input-field">
      <label className="rule-input-label">{label} {MAP_COPY.ruleInputs.orSuffix}</label>
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
            <TextInput
              size="xs"
              className="dm-grow"
              classNames={{ input: "dm-mono" }}
              aria-label={label}
              value={c}
              onChange={e => updateAt(i, e.target.value)}
              placeholder={placeholder}
            />
            {connects.length > 1 && (
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={MAP_COPY.ruleInputs.removeClause}
                onClick={(e) => { e.stopPropagation(); removeAt(i) }}
                title={MAP_COPY.ruleInputs.removeClause}
              ><IconX size={14} /></ActionIcon>
            )}
          </div>
        )
      })}
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconPlus size={12} />}
        onClick={addClause}
      >{MAP_COPY.ruleInputs.addOrClause}</Button>
    </div>
  )
}

// ExcludeInputs manages a group's excluded-card list: one select per exclusion,
// offering the currently matched cards (plus any stale saved excludes). Unlike
// GroupMultiSelect the list may be empty, so rows only exist once added.
export function ExcludeInputs({ values, onChange, options }) {
  function updateAt(i, val) {
    const next = [...values]
    next[i] = val
    onChange(next)
  }
  function removeAt(i) {
    onChange(values.filter((_, idx) => idx !== i))
  }
  return (
    <div className="rule-input-section">
      <label className="rule-input-label">{MAP_COPY.ruleInputs.excludeCards}</label>
      {values.map((v, i) => (
        <div key={i} className="rule-input-row">
          <NativeSelect
            size="xs"
            className="dm-grow"
            classNames={{ input: "dm-mono" }}
            aria-label={MAP_COPY.ruleInputs.excludeCardLabel}
            value={v}
            onChange={e => updateAt(i, e.target.value)}
          >
            <option value="">{MAP_COPY.ruleInputs.selectCard}</option>
            <optgroup label={MAP_COPY.ruleInputs.cardsOption}>
              {options.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </optgroup>
          </NativeSelect>
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label={MAP_COPY.ruleInputs.removeExclusion}
            onClick={() => removeAt(i)}
            title={MAP_COPY.ruleInputs.removeExclusion}
          ><IconX size={14} /></ActionIcon>
        </div>
      ))}
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconPlus size={12} />}
        onClick={() => onChange([...values, ""])}
      >{MAP_COPY.ruleInputs.excludeACard}</Button>
    </div>
  )
}
