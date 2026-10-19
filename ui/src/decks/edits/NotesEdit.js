import React, { useState } from "react"
import { Button, Group, Textarea } from "@mantine/core"
import { inlineEditKeys } from "../../components/kit/inlineEditKeys.js"

// NotesEdit is the open notes editor: a text box holding the notes, with Save
// and Cancel. Enter adds a line here, so saving is the button's job; Escape
// cancels as in the other editors.
export function NotesEdit({ deck, edits, done, copy }) {
  const [text, setText] = useState(deck.notes || "")

  function save() {
    if (text !== (deck.notes || "")) {
      edits.saveMeta(copy.notes, { notes: text })
    }
    done()
  }

  function onKeyDown(event) {
    if (inlineEditKeys(event.key) === "cancel") {
      done()
    }
  }

  return (
    <>
      <Textarea
        autoFocus
        autosize
        minRows={6}
        aria-label={copy.notes}
        value={text}
        onChange={event => setText(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <Group justify="flex-end" gap="xs" mt="xs">
        <Button variant="default" size="xs" onClick={done}>{copy.cancel}</Button>
        <Button size="xs" onClick={save}>{copy.save}</Button>
      </Group>
    </>
  )
}
