// How a stats table's sort order changes when a column header is clicked, and
// how rows compare under it. Kept free of React so node tests can load it. A
// sort is { key, dir }, where dir is "asc" or "desc".

// nextSort returns the sort after clicking the key column. Clicking the column
// already sorted flips its direction; a new column starts high to low for
// numbers and A to Z for text.
export function nextSort(sort, key, numeric) {
  if (sort.key === key) {
    let dir = "asc"
    if (sort.dir === "asc") {
      dir = "desc"
    }
    return { key, dir }
  }

  if (numeric) {
    return { key, dir: "desc" }
  }
  return { key, dir: "asc" }
}

// compareBy returns a sort comparator that orders rows by value(row), low to
// high for "asc" and high to low for "desc".
export function compareBy(value, dir) {
  return function (a, b) {
    const av = value(a)
    const bv = value(b)

    let order = 0
    if (av < bv) {
      order = -1
    } else if (av > bv) {
      order = 1
    }

    if (dir === "asc") {
      return order
    }
    return -order
  }
}
