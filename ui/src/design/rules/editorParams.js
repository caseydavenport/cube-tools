// How the Rules editor changes its URL, kept free of React so node tests can
// load it. The URL holds the view, search, sort, review card and the card a
// group check starts with.

// nextEditorParams applies patch to params and returns { params, push }. An
// empty value removes its param. Moving to another view drops the group check
// card, which belongs to the view it was opened with, and push is true then,
// so the browser's Back button returns to the previous view. Every other
// change replaces the current history entry. params itself is left alone.
export function nextEditorParams(params, patch) {
  const next = new URLSearchParams(params)
  const oldView = params.get("view") || ""
  let viewChanged = false
  if ("view" in patch) {
    viewChanged = (patch.view || "") !== oldView
    if (viewChanged && !("check" in patch)) {
      next.delete("check")
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
  }
  return { params: next, push: viewChanged }
}
