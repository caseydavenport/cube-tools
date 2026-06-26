import React, { useState, useId } from 'react'

// TagEditor renders the current tags as removable pills plus a text input with
// datalist autocomplete. onChange fires with the complete new tag list whenever
// a tag is added (Enter) or removed (pill x). Duplicates and blanks are ignored.
export function TagEditor({ tags, suggestions, onChange }) {
  const [text, setText] = useState("")
  const current = tags || []
  // Unique per instance so multiple TagEditors on one page (e.g. the selected
  // deck plus comparison decks) don't share a datalist and cross-wire suggestions.
  const listId = useId()

  const addTag = (raw) => {
    const t = raw.trim()
    if (!t || current.includes(t)) {
      setText("")
      return
    }
    onChange([...current, t])
    setText("")
  }

  const removeTag = (t) => {
    onChange(current.filter((x) => x !== t))
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag(text)
    } else if (e.key === "Tab" && text.trim() !== "") {
      // Complete the current tag but keep focus here so the user can keep adding.
      e.preventDefault()
      addTag(text)
    } else if (e.key === "Backspace" && text === "" && current.length > 0) {
      removeTag(current[current.length - 1])
    }
  }

  return (
    <div className="tag-editor" style={{"display": "flex", "flexWrap": "wrap", "alignItems": "center", "gap": "0.25rem"}}>
      {current.map((t) => (
        <span key={t} className="tag-pill" style={{"display": "inline-flex", "alignItems": "center", "gap": "0.25rem", "padding": "0.1rem 0.4rem", "borderRadius": "0.75rem", "background": "var(--border)"}}>
          {t}
          <button type="button" onClick={() => removeTag(t)} style={{"border": "none", "background": "none", "cursor": "pointer", "color": "var(--primary)", "padding": "0", "lineHeight": "1"}} aria-label={`Remove ${t}`}>×</button>
        </span>
      ))}
      <input
        className="text-input"
        list={listId}
        value={text}
        placeholder="Add tag…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addTag(text)}
        style={{"minWidth": "6rem", "flex": "1"}}
      />
      <datalist id={listId}>
        {(suggestions || []).map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}
