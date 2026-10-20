// Small pieces several Rules editor panes share: Edit and Delete buttons, a
// wire end, and a chip button.

import React from 'react'
import { Button } from '@mantine/core'
import { cardRefName } from '../../utils/DesignRules.js'

// EditActions are the Edit and Delete buttons on a group or link. Delete asks
// once more before it saves.
export function EditActions({ confirming, setConfirming, onEdit, onDelete }) {
  if (confirming) {
    return (
      <span className="de-pane-actions">
        <Button size="xs" color="red" variant="light" onClick={onDelete}>Confirm delete</Button>
        <Button size="xs" variant="default" onClick={() => setConfirming(false)}>Keep</Button>
      </span>
    )
  }

  return (
    <span className="de-pane-actions">
      <Button size="xs" variant="default" onClick={onEdit}>Edit</Button>
      <Button size="xs" color="red" variant="light" onClick={() => setConfirming(true)}>Delete</Button>
    </span>
  )
}

export function Emph({ me, name }) {
  // Card: wire refs display as the bare card name.
  return <span className={'de-end' + (name === me ? ' de-end-me' : '')}>{cardRefName(name) || name}</span>
}

// ChipButton is one small clickable item in an audit list or link summary: lead
// is the color swatch or mana pips in front of the label.
export function ChipButton({ lead, children, ...buttonProps }) {
  return (
    <Button size="compact-xs" variant="light" className="de-chip" leftSection={lead} {...buttonProps}>
      {children}
    </Button>
  )
}
