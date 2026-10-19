import React, { useState } from "react"
import ReactMarkdown from "react-markdown"
import { ActionIcon, Button } from "@mantine/core"
import { IconPencil } from "@tabler/icons-react"
import { SectionCard } from "../components/kit/SectionCard.js"
import { NotesEdit } from "./edits/NotesEdit.js"

// CARD_REFERENCE matches a [[Card Name]] reference in deck notes.
const CARD_REFERENCE = /\[\[(.*?)\]\]/g

// linkCardReferences turns each [[Card Name]] in the notes into a bold markdown
// link to the card, when the card is in the deck; others become plain names.
export function linkCardReferences(notes, deck) {
  const urls = new Map()
  for (const card of [...(deck.mainboard || []), ...(deck.sideboard || [])]) {
    urls.set(card.name, card.url)
  }

  return notes.replace(CARD_REFERENCE, (_, name) => {
    if (urls.has(name)) {
      return `**[${name}](${urls.get(name)})**`
    }
    return name
  })
}

// NotesCard shows the notes written about the deck, as markdown. On writable
// cubes a pencil opens the notes editor, and a deck without notes offers an
// "Add notes" button; on read-only cubes a deck without notes shows nothing.
export function NotesCard({ deck, edits, copy }) {
  const [editing, setEditing] = useState(false)
  const notes = deck.notes || ""

  if (notes === "" && !edits.editable) {
    return null
  }

  if (editing) {
    return (
      <SectionCard title={copy.notes}>
        <NotesEdit deck={deck} edits={edits} done={() => setEditing(false)} copy={copy} />
      </SectionCard>
    )
  }

  if (notes === "") {
    return (
      <SectionCard title={copy.notes}>
        <Button variant="default" size="xs" onClick={() => setEditing(true)}>{copy.addNotes}</Button>
      </SectionCard>
    )
  }

  let pencil = null
  if (edits.editable) {
    pencil = (
      <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Edit ${copy.notes}`} onClick={() => setEditing(true)}>
        <IconPencil size={14} />
      </ActionIcon>
    )
  }

  return (
    <SectionCard title={copy.notes} action={pencil}>
      <div className="deck-notes">
        <ReactMarkdown>{linkCardReferences(notes, deck)}</ReactMarkdown>
      </div>
    </SectionCard>
  )
}
