import React, { useState } from "react"
import { ActionIcon } from "@mantine/core"
import { IconPencil } from "@tabler/icons-react"
import "./kit.css"

// EditableField shows a value with a small pencil button beside it. Clicking the
// pencil swaps the value for an editor, which renderEditor builds; the editor
// calls done() to switch back. When editable is false only the value shows, so
// read-only cubes get no pencils at all.
export function EditableField({ editable, label, display, renderEditor }) {
  const [editing, setEditing] = useState(false)

  if (!editable) {
    return display
  }

  if (editing) {
    return renderEditor({ done: () => setEditing(false) })
  }

  return (
    <span className="kit-editable">
      {display}
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={`Edit ${label}`}
        onClick={() => setEditing(true)}
      >
        <IconPencil size={14} />
      </ActionIcon>
    </span>
  )
}
