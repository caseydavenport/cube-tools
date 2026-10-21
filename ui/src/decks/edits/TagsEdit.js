import React, { useRef, useState } from "react"
import { Autocomplete, Button, CloseButton } from "@mantine/core"
import { inlineEditKeys } from "../../components/kit/inlineEditKeys.js"
import { addTag, removeTag } from "../deckEdits.js"

// Tags shows the deck's free-form tags as pills.
function Tags({ tags }) {
  return (
    <div className="deck-tags">
      {tags.map(tag => (
        <span key={tag} className="deck-tag">{tag}</span>
      ))}
    </div>
  )
}

// TagInput is the box that replaces the "+ tag" chip while typing a new tag.
// Enter or picking a suggestion adds the tag; Escape or clicking away closes it.
function TagInput({ tags, suggestions, onAdd, onClose, copy }) {
  const [text, setText] = useState("")

  // Enter on a highlighted suggestion fires both the key handler and the
  // suggestion handler. This ref (a value kept between renders that doesn't
  // re-render when it changes) makes sure only the first one saves.
  const added = useRef(false)

  function add(value) {
    if (added.current) {
      return
    }
    added.current = true
    onAdd(addTag(tags, value))
    onClose()
  }

  function onKeyDown(event) {
    const action = inlineEditKeys(event.key)
    if (action === "save") {
      add(text)
    } else if (action === "cancel") {
      onClose()
    }
  }

  return (
    <Autocomplete
      size="xs"
      w={160}
      autoFocus
      aria-label={copy.addTag}
      placeholder={copy.addTag}
      data={suggestions.filter(s => !tags.includes(s))}
      value={text}
      onChange={setText}
      onOptionSubmit={add}
      onKeyDown={onKeyDown}
      onBlur={onClose}
    />
  )
}

// EditableTag is one tag pill with a small remove button, disabled while a save
// is in flight.
function EditableTag({ tag, onRemove, disabled, copy }) {
  return (
    <span className="deck-tag deck-tag-editable">
      {tag}
      <CloseButton size="xs" aria-label={`${copy.removeTag} ${tag}`} disabled={disabled} onClick={() => onRemove(tag)} />
    </span>
  )
}

// TagsEdit is the row of tag pills under the player's name. On writable cubes
// each pill can be removed and a "+ tag" chip adds one, saving on each change.
// The controls lock while a save is in flight, since each save sends the whole
// tag list and a second one could undo the first.
export function TagsEdit({ deck, edits, suggestions, copy }) {
  const [adding, setAdding] = useState(false)
  const tags = deck.labels || []

  if (!edits.editable) {
    return <Tags tags={tags} />
  }

  function save(next) {
    if (next !== tags) {
      edits.saveMeta(copy.tags, { labels: next })
    }
  }

  return (
    <div className="deck-tags">
      {tags.map(tag => (
        <EditableTag key={tag} tag={tag} onRemove={t => save(removeTag(tags, t))} disabled={edits.saving} copy={copy} />
      ))}

      {adding && <TagInput tags={tags} suggestions={suggestions} onAdd={save} onClose={() => setAdding(false)} copy={copy} />}
      {!adding && (
        <Button size="compact-xs" variant="light" disabled={edits.saving} onClick={() => setAdding(true)}>
          {copy.plusTag}
        </Button>
      )}
    </div>
  )
}
