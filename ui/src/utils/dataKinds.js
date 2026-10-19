// The kinds of data a cube may or may not have, as /api/{cube}/info reports
// them, and helpers for hiding the parts of a page that need data the cube
// lacks. Kept free of imports so node tests can load it.

// hasData reports whether the cube has one kind of data: decks, results,
// pick_logs, archetypes, sideboards, or writable. Unknown data (info not
// loaded yet, or the request failed) counts as present, so nothing flashes
// away while info loads. Write access is the exception: it must be known.
export function hasData(info, kind) {
  if (kind === "writable") {
    return info.writable === true
  }
  return info[kind] !== false
}

// meetsNeeds reports whether the cube has every kind of data in needs.
export function meetsNeeds(info, needs = []) {
  for (const kind of needs) {
    if (!hasData(info, kind)) {
      return false
    }
  }
  return true
}

// visibleItems keeps the items the cube can fill, in order. An item lists the
// data it needs in an optional needs array, like a column needing results or
// a chart needing sideboards; an item without one is always kept.
export function visibleItems(items, info) {
  return items.filter(item => meetsNeeds(info, item.needs))
}

// availableValue returns value when its item is visible, otherwise the first
// visible item's value, or null when nothing is. It keeps a default or a
// remembered choice from pointing at an option the cube can't show. For a pair
// of pickers, avoid is the other picker's value: the fallback skips it unless
// it's the only option left, so the two don't land on the same thing.
export function availableValue(value, items, info, avoid = null) {
  const visible = visibleItems(items, info)

  for (const item of visible) {
    if (item.value === value) {
      return value
    }
  }

  for (const item of visible) {
    if (item.value !== avoid) {
      return item.value
    }
  }

  if (visible.length > 0) {
    return visible[0].value
  }
  return null
}
