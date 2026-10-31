// The side panel for one group on the package page: its members by the
// condition they matched, its excludes, and "Check a card".

import React from "react"
import { Drawer } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { ruleColor } from "../design/map/ruleColors.js"
import { GroupSection, useRuleGroups } from "../design/rules/GroupSection.js"
import { groupPanelState } from "./packagePageModel.js"

// GroupPanel shows the entry called name from the package packageName. It
// loads the whole package's entries, so card entries and undefined groups
// open too. groupsByName holds the rules' groups, for editing and checks.
export function GroupPanel({ name, packageName, groupsByName, groupIndex, canEdit, range, refresh, onClose, onEdit, onExclude, onRestore }) {
  const cube = useCube()
  const state = groupPanelState(useRuleGroups(cube, { package: packageName }, refresh, range), name)

  let body = <div className="de-muted">Loading…</div>
  if (state.kind === "failed") {
    body = <div className="de-muted">Couldn't load this group.</div>
  } else if (state.kind === "missing") {
    body = <div className="de-muted">{packageName} doesn't use {name}.</div>
  } else if (state.kind === "members") {
    let color = "var(--se-muted)"
    if (groupIndex[name] !== undefined) {
      color = ruleColor(groupIndex[name])
    }
    body = (
      <GroupSection
        id="group-panel" members={state.members} group={groupsByName[name] || null} packageName={packageName}
        color={color} warning={null} canEdit={canEdit} showUses={false}
        onEdit={onEdit} onExclude={card => onExclude(name, card)} onRestore={card => onRestore(name, card)}
        initialCheck=""
      />
    )
  }

  return (
    <Drawer opened onClose={onClose} position="right" size="xl" aria-label={name}>
      {body}
    </Drawer>
  )
}
