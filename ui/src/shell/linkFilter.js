// The app-wide deck filter, and the rule that a filter set by following a link
// is temporary: leaving the page the link opened puts the old filter back. A
// filter the user types stays. These are pure so node tests can load them.

// linkFilterStart is the filter state for a starting filter: match is the
// filter in use, and saved is null until a link sets one.
export function linkFilterStart(match) {
  return { match, saved: null }
}

// followLink applies a link's filter from page, saving the filter to restore.
// A second link before the first is undone keeps the original filter.
export function followLink(state, match, page) {
  let previous = state.match
  if (state.saved) {
    previous = state.saved.previous
  }
  return { match, saved: { previous, from: page, landed: "" } }
}

// typeFilter applies a filter the user set, which stays across pages. The
// same filter sent again, as a page's filter box does on load, changes nothing.
export function typeFilter(state, match) {
  if (match === state.match) {
    return state
  }
  return { match, saved: null }
}

// changePage tracks moves between pages. The first page reached after a link
// is the one it opened; moving off that page restores the saved filter.
export function changePage(state, page) {
  const saved = state.saved
  if (!saved) {
    return state
  }
  if (saved.landed === "") {
    if (page === saved.from) {
      return state
    }
    return { ...state, saved: { ...saved, landed: page } }
  }
  if (page === saved.landed) {
    return state
  }
  return linkFilterStart(saved.previous)
}
