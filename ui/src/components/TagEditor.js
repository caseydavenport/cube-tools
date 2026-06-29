import React, { useState, useRef } from 'react'

// TagEditor renders the current tags as removable pills plus a text input with a
// custom autocomplete dropdown. onChange fires with the complete new tag list
// whenever a tag is added (Enter, click a suggestion) or removed (pill x, or
// Backspace on an empty input). Duplicates and blanks are ignored.
//
// This used to lean on a native <datalist>, but its popup was unreliable about
// when it surfaced suggestions, so we render our own dropdown (same styling as
// the search autocomplete) for predictable behavior across browsers.
export function TagEditor({ tags, suggestions, onChange }) {
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  // -1 means "no suggestion highlighted - Enter adds the typed text"; >=0 picks
  // the highlighted suggestion. Lets you both add existing tags and brand-new ones.
  const [selected, setSelected] = useState(-1)
  const current = tags || []
  const blurTimeout = useRef(null)

  // Suggestions not already added, matched as a case-insensitive substring of
  // what's typed. Empty input shows the full remaining list (so focus reveals it).
  const q = text.trim().toLowerCase()
  const matches = (suggestions || [])
    .filter((s) => !current.includes(s))
    .filter((s) => q === "" || s.toLowerCase().includes(q))

  const addTag = (raw) => {
    const t = raw.trim()
    if (!t || current.includes(t)) {
      setText("")
      setSelected(-1)
      return
    }
    onChange([...current, t])
    setText("")
    setSelected(-1)
  }

  const removeTag = (t) => {
    onChange(current.filter((x) => x !== t))
  }

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setSelected((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((i) => Math.max(i - 1, -1))
    } else if (e.key === "Enter" || (e.key === "Tab" && text.trim() !== "")) {
      // Enter/Tab commits: the highlighted suggestion if there is one, else the
      // typed text. Tab keeps focus so you can keep adding tags.
      e.preventDefault()
      addTag(selected >= 0 && matches[selected] ? matches[selected] : text)
    } else if (e.key === "Escape") {
      setOpen(false)
      setSelected(-1)
    } else if (e.key === "Backspace" && text === "" && current.length > 0) {
      removeTag(current[current.length - 1])
    }
  }

  const onFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current)
    setOpen(true)
  }

  // Delay close so a mousedown on a suggestion still registers before blur hides it.
  const onBlur = () => {
    blurTimeout.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <div className="tag-editor" style={{"position": "relative", "display": "flex", "flexWrap": "wrap", "alignItems": "center", "gap": "0.25rem"}}>
      {current.map((t) => (
        <span key={t} className="tag-pill" style={{"display": "inline-flex", "alignItems": "center", "gap": "0.25rem", "padding": "0.1rem 0.4rem", "borderRadius": "0.75rem", "background": "var(--border)"}}>
          {t}
          <button type="button" onClick={() => removeTag(t)} style={{"border": "none", "background": "none", "cursor": "pointer", "color": "var(--primary)", "padding": "0", "lineHeight": "1"}} aria-label={`Remove ${t}`}>×</button>
        </span>
      ))}
      <input
        className="text-input"
        value={text}
        placeholder="Add tag…"
        onChange={(e) => { setText(e.target.value); setOpen(true); setSelected(-1) }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{"minWidth": "6rem", "flex": "1"}}
      />
      {open && matches.length > 0 && (
        <div className="search-autocomplete" style={{"width": "100%"}}>
          {matches.map((s, idx) => (
            <div
              key={s}
              className={"search-autocomplete-item" + (idx === selected ? " search-autocomplete-item-selected" : "")}
              onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
              onMouseEnter={() => setSelected(idx)}
            >
              <span className="search-autocomplete-term">{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
