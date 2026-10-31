// The link check's answer for two cards the rules don't link: each card's
// groups and where they're used, and a bar to link two of them. It never
// guesses which link is right.

import React, { useEffect, useState } from "react"
import { Button, Radio, Select, TextInput, UnstyledButton } from "@mantine/core"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { applyLink, linkOptions, usesText } from "./linkCheckModel.js"

// wiresText lists a group's wires for its hover, like "Sacrifice wire 1".
function wiresText(uses) {
  if (uses.length === 0) {
    return "No package uses this group."
  }
  return uses.map(u => `${u.package} wire ${u.wire + 1}`).join(", ")
}

// GroupRow is one of a card's groups, selectable when picked is set.
function GroupRow({ group, selected, onPick }) {
  let className = "link-group"
  if (selected) {
    className += " link-group-on"
  }
  const row = (
    <UnstyledButton className={className} onClick={() => onPick(group.group)} disabled={!onPick}>
      <span className="link-group-name">{group.group}</span>
      <span className="link-group-uses">{usesText(group.uses)}</span>
    </UnstyledButton>
  )
  return <HoverInfo info={wiresText(group.uses)}>{row}</HoverInfo>
}

// GroupColumn lists one card's groups, ending with "+ New group" when the
// cube can be edited.
function GroupColumn({ card, picked, onPick, onNewGroup }) {
  return (
    <div className="link-column">
      <div className="link-column-head">{card.name}'s groups</div>
      {card.groups.length === 0 && <div className="link-muted">No groups</div>}
      {card.groups.map(g => (
        <GroupRow key={g.group} group={g} selected={picked === g.group} onPick={onPick} />
      ))}
      {onNewGroup && (
        <UnstyledButton className="link-group link-group-new" onClick={onNewGroup}>
          + New group
        </UnstyledButton>
      )}
    </div>
  )
}

// usesOf finds a group's uses on a card.
function usesOf(card, group) {
  const found = card.groups.find(g => g.group === group)
  if (!found) {
    return []
  }
  return found.uses
}

// usePreview asks the server how a proposed rule set moves package build
// counts. It returns null while the answer is on its way.
function usePreview(cube, proposed) {
  const [changes, setChanges] = useState(null)
  const body = proposed ? JSON.stringify(proposed) : ""
  useEffect(() => {
    setChanges(null)
    if (!body) {
      return
    }
    let cancelled = false
    fetch(`/api/${cube}/stats/rules-preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then(r => r.json())
      .then(resp => {
        if (!cancelled) {
          setChanges(resp.packages || [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChanges([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [cube, body])
  return changes
}

// PreviewLine says how the change moves build counts.
function PreviewLine({ changes }) {
  if (changes === null) {
    return <div className="link-muted">Working out the effect…</div>
  }
  if (changes.length === 0) {
    return <div className="link-muted">No package would be built in more or fewer decks.</div>
  }
  return (
    <div className="link-muted">
      {changes.map(c => (
        <span key={c.name} className="link-preview-item">
          {c.name}: built in <b>{c.now} → {c.after}</b> decks
        </span>
      ))}
    </div>
  )
}

// LinkBar shows the link about to be made, the ways to make it, a preview,
// and the button that saves it.
function LinkBar({ cube, rules, groupA, groupB, check, onSave }) {
  const options = linkOptions(groupA, usesOf(check.a, groupA), groupB, usesOf(check.b, groupB))
  const [choice, setChoice] = useState("0")
  const [packageName, setPackageName] = useState("")
  const option = options[Number(choice)] || options[0]

  let proposed = null
  if (option && (option.kind === "add-to-wire" || packageName.trim())) {
    proposed = applyLink(rules, option, groupA, groupB, packageName.trim())
  }
  const changes = usePreview(cube, proposed)

  if (options.length === 0) {
    return <div className="link-bar link-muted">These groups already link through a wire.</div>
  }
  return (
    <div className="link-bar">
      <div className="link-bar-pair">
        <span className="kit-chip kit-chip-neutral">{groupA}</span>
        <span className="link-bar-line" />
        <span className="kit-chip kit-chip-neutral">{groupB}</span>
      </div>
      <Radio.Group value={String(options.indexOf(option))} onChange={setChoice}>
        <div className="link-options">
          {options.map((o, i) => (
            <Radio key={i} value={String(i)} size="xs" label={o.label} />
          ))}
        </div>
      </Radio.Group>
      {option.kind === "new-wire" && (
        <Select
          size="xs"
          placeholder="Package"
          data={rules.packages.map(p => p.name)}
          value={packageName || null}
          onChange={value => setPackageName(value || "")}
          className="link-input"
          comboboxProps={{ withinPortal: false }}
        />
      )}
      {option.kind === "new-package" && (
        <TextInput size="xs" placeholder="New package name" value={packageName} onChange={e => setPackageName(e.target.value)} className="link-input" />
      )}
      {proposed && <PreviewLine changes={changes} />}
      <Button size="xs" disabled={!proposed} onClick={() => onSave(proposed)}>Link them</Button>
    </div>
  )
}

// UnlinkedView shows both cards' groups and, once a group is picked on each
// side, the bar that links them. rules is the rule set as saved; onSave
// saves a changed rule set and onNewGroup opens the group editor for a card.
// Both are null on a cube that can't be edited.
export function UnlinkedView({ check, cube, rules, onSave, onNewGroup }) {
  const [groupA, setGroupA] = useState("")
  const [groupB, setGroupB] = useState("")
  const editable = Boolean(onSave)

  let pickA = null
  let pickB = null
  let newA = null
  let newB = null
  if (editable) {
    pickA = setGroupA
    pickB = setGroupB
    newA = () => onNewGroup(check.a.name)
    newB = () => onNewGroup(check.b.name)
  }

  return (
    <div className="link-middle link-middle-wide">
      <div className="link-verdict">
        Not linked
        <small>No wire has one card's group on one side and the other card's on the other.</small>
      </div>
      <div className="link-columns">
        <GroupColumn card={check.a} picked={groupA} onPick={pickA} onNewGroup={newA} />
        <GroupColumn card={check.b} picked={groupB} onPick={pickB} onNewGroup={newB} />
      </div>
      {editable && groupA && groupB && (
        <LinkBar key={groupA + "|" + groupB} cube={cube} rules={rules} groupA={groupA} groupB={groupB} check={check} onSave={onSave} />
      )}
    </div>
  )
}
