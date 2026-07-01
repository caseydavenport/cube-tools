import { useEffect } from "react"

// useArrowNav wires left/right arrow keys to step through a list and select the
// previous/next item. Shared by the Browse index rails (Decklists, Drafts,
// Players). items is the visible list in display order, selectedId is the
// currently selected id, getId pulls the id off an item, and onSelect(id) makes
// the selection. Arrows are ignored while typing in a form field.
export function useArrowNav(items, selectedId, getId, onSelect) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      const tag = (e.target.tagName || "").toLowerCase()
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return
      if (!items.length) return
      const idx = items.findIndex((it) => getId(it) === selectedId)
      let nextIdx
      if (idx === -1) {
        nextIdx = 0
      } else {
        nextIdx = idx + (e.key === "ArrowRight" ? 1 : -1)
        if (nextIdx < 0 || nextIdx >= items.length) return
      }
      e.preventDefault()
      onSelect(getId(items[nextIdx]))
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [items, selectedId]);
}
