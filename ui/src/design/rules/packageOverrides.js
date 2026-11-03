// Pure helpers for a cube's package overrides, the packages it always shows
// or always hides whatever the relevance line says. Kept free of React so
// node tests can load them.

// sameName reports whether two package names match, ignoring case.
function sameName(a, b) {
  return a.toLowerCase() === b.toLowerCase()
}

// withoutName returns the list with every spelling of name taken out.
function withoutName(list, name) {
  return (list || []).filter(n => !sameName(n, name))
}

// nextOverrides returns new overrides with name set to state: "on" always
// shows it, "off" always hides it, and "line" lets the relevance line decide.
// The overrides passed in are left unchanged.
export function nextOverrides(overrides, name, state) {
  const on = withoutName(overrides.on, name)
  const off = withoutName(overrides.off, name)
  if (state === "on") {
    on.push(name)
  } else if (state === "off") {
    off.push(name)
  }
  return { on, off }
}

// shownState turns the server's forced value ("on", "off" or "") into the
// switch's value, where "line" means the package isn't forced.
export function shownState(forced) {
  if (forced === "on" || forced === "off") {
    return forced
  }
  return "line"
}

// switchValue is what the switch shows: a choice still being saved
// (pending), or else the server's forced value. Without it the switch would
// jump back to the old choice until the page reloads.
export function switchValue(pending, forced) {
  if (pending) {
    return pending
  }
  return shownState(forced)
}
