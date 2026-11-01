// How the Rules editor changes its URL, kept free of React so node tests can
// load it. The URL holds the view, search, sort and review card.

// nextEditorParams applies patch to params and returns { params, push }. An
// empty value removes its param. Moving to another view sets push, so the
// browser's Back button returns to the previous view. Every other change
// replaces the current history entry. params itself is left alone.
export function nextEditorParams(params, patch) {
  const next = new URLSearchParams(params)
  const oldView = params.get("view") || ""
  let viewChanged = false
  if ("view" in patch) {
    viewChanged = (patch.view || "") !== oldView
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
