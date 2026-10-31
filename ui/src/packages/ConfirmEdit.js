// A small dialog that asks before saving a one-step rule change from the
// package page, such as adding or removing a wire, and shows its effect.

import React from "react"
import { Button, Group, Modal } from "@mantine/core"
import { PreviewLine, usePreview } from "../design/rulesPreview.js"

// ConfirmEdit asks whether to save proposed, the whole { groups, packages }
// after the change, showing how it moves build counts over range. onSave
// gets proposed back.
export function ConfirmEdit({ cube, proposed, range, title, onSave, onCancel }) {
  const preview = usePreview(cube, proposed, range, 0)
  return (
    <Modal opened onClose={onCancel} title={title} centered size="md">
      <PreviewLine preview={preview} />
      <Group justify="flex-end" gap="xs" mt="md">
        <Button size="xs" variant="default" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={() => onSave(proposed)}>Save</Button>
      </Group>
    </Modal>
  )
}
