// Small edits to the rulebook that the editor's save handlers share.

// Rebuild a group with the given exclude list, dropping the key entirely when
// empty so saved JSON doesn't grow "exclude": [] on every group.
export function withExclude(group, exclude) {
  const next = { ...group }
  if (exclude.length) next.exclude = exclude
  else delete next.exclude
  return next
}

// Propagate a group rename through every wire end of a link.
export function renameInLink(link, oldName, newName) {
  return {
    ...link,
    wires: (link.wires || []).map(w => ({
      sources: (w.sources || []).map(s => s === oldName ? newName : s),
      targets: (w.targets || []).map(t => t === oldName ? newName : t),
    })),
  }
}
