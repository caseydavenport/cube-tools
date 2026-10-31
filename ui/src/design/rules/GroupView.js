// One group opened on its own in the Rules editor, for groups no package
// uses or a group a link points at.

import React, { useState } from 'react'
import { UnstyledButton } from '@mantine/core'
import { useCube } from "../../contexts/CubeContext.js"
import { EditActions } from "./rulesParts.js"
import { GroupSection, useRuleGroups } from "./GroupSection.js"
import "./workspace.css"

// GroupView loads and shows the group called name. group is its rules entry,
// or undefined when the rules have no such group.
export function GroupView({
  name, group, color, warning, canEdit, refresh, initialCheck,
  onBack, onEdit, onDelete, onExclude, onRestore, onOpenPackage,
}) {
  const cube = useCube()
  const [confirming, setConfirming] = useState(false)
  const { groups, missing, failed } = useRuleGroups(cube, { group: name }, refresh)

  let body = <div className="de-muted">Loading…</div>
  if (missing) {
    body = <div className="de-muted">No group named {name}.</div>
  } else if (failed) {
    body = <div className="de-muted">Couldn't load this group.</div>
  } else if (groups && groups.length > 0) {
    body = (
      <GroupSection
        id="rg-group" members={groups[0]} group={group || null} packageName="" color={color} warning={warning}
        canEdit={canEdit} onEdit={null} onExclude={card => onExclude(name, card)}
        onRestore={card => onRestore(name, card)} onOpenPackage={onOpenPackage} initialCheck={initialCheck}
      />
    )
  }

  return (
    <div className="ws-page">
      <div className="ws-group-bar">
        <UnstyledButton className="ws-back" onClick={onBack}>← All packages</UnstyledButton>
        {canEdit && group && <EditActions confirming={confirming} setConfirming={setConfirming} onEdit={onEdit} onDelete={onDelete} />}
      </div>
      {body}
    </div>
  )
}
