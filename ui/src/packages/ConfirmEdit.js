// A small dialog that asks before saving a one-step rule change from the
// package page, such as adding or removing a wire, and shows its effect.

import React from "react"
import { Button, Group, Modal } from "@mantine/core"
import { PreviewLine, usePreview } from "../design/rulesPreview.js"

// ConfirmEdit asks whether to save proposed, the whole { groups, packages }
// after the change, showing how it moves build counts over range. A message,
// when given, shows instead of the preview, as for a delete the preview can't
// describe. onSave gets proposed back.
export function ConfirmEdit({ cube, proposed, range, title, message, confirmLabel = "Save", onSave, onCancel }) {
  let previewOf = proposed
  if (message) {
    previewOf = null
  }
  const preview = usePreview(cube, previewOf, range, 0)
  let body = <PreviewLine preview={preview} />
  if (message) {
    body = <div className="rp-line">{message}</div>
  }
  return (
    <Modal opened onClose={onCancel} title={title} centered size="md">
      {body}
      <Group justify="flex-end" gap="xs" mt="md">
        <Button size="xs" variant="default" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={() => onSave(proposed)}>{confirmLabel}</Button>
      </Group>
    </Modal>
  )
}
