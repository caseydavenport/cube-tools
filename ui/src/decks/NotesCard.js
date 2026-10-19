import React from "react"
import ReactMarkdown from "react-markdown"
import { SectionCard } from "../components/kit/SectionCard.js"

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

// NotesCard shows the notes written about the deck, as markdown. It shows
// nothing when the deck has no notes.
export function NotesCard({ deck, copy }) {
  const notes = deck.notes || ""
  if (notes === "") {
    return null
  }

  return (
    <SectionCard title={copy.notes}>
      <div className="deck-notes">
        <ReactMarkdown>{linkCardReferences(notes, deck)}</ReactMarkdown>
      </div>
    </SectionCard>
  )
}
