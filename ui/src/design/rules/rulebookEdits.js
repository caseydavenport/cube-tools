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
export function renameInPackage(pkg, oldName, newName) {
  return {
    ...pkg,
    wires: (pkg.wires || []).map(w => ({
      sources: (w.sources || []).map(s => s === oldName ? newName : s),
      targets: (w.targets || []).map(t => t === oldName ? newName : t),
    })),
  }
}

// cleanGroup trims a group from the editor the way it's saved: blank
// conditions and excludes dropped, an empty name filled in. It's null when no
// condition is left.
export function cleanGroup(group) {
  const conditions = group.conditions.map(c => c.trim()).filter(Boolean)
  if (conditions.length === 0) {
    return null
  }
  // copy-ok: name saved to the rules file
  const name = group.name.trim() || "Untitled group"
  return withExclude({ name, conditions }, (group.exclude || []).filter(Boolean))
}

// withGroup returns a copy of config with group in place of the group called
// originalName, renamed in every wire if its name changed. An empty
// originalName adds group instead. config itself is never changed.
export function withGroup(config, originalName, group) {
  if (!originalName) {
    return { ...config, groups: [...config.groups, group] }
  }
  const groups = config.groups.map(g => g.name === originalName ? group : g)
  let packages = config.packages
  if (group.name !== originalName) {
    packages = packages.map(p => renameInPackage(p, originalName, group.name))
  }
  return { ...config, groups, packages }
}

// withPackage returns a copy of config with pkg in place of the package
// called originalName, or added when originalName is empty.
export function withPackage(config, originalName, pkg) {
  if (!originalName) {
    return { ...config, packages: [...config.packages, pkg] }
  }
  return { ...config, packages: config.packages.map(p => p.name === originalName ? pkg : p) }
}

// withCardExcluded returns a copy of groups with card added to, or removed
// from, the exclude list of the group called groupName.
export function withCardExcluded(groups, groupName, card, excluded) {
  return groups.map(g => {
    if (g.name !== groupName) {
      return g
    }
    const kept = (g.exclude || []).filter(n => n !== card)
    if (excluded) {
      kept.push(card)
    }
    return withExclude(g, kept)
  })
}

// withWireAdded returns a copy of config with a new wire in the package
// called pkgName, joining group a on one side to group b on the other.
export function withWireAdded(config, pkgName, a, b) {
  const packages = config.packages.map(p => {
    if (p.name !== pkgName) {
      return p
    }
    return { ...p, wires: [...(p.wires || []), { sources: [a], targets: [b] }] }
  })
  return { ...config, packages }
}

// withWireRemoved returns a copy of config without wire index of the package
// called pkgName.
export function withWireRemoved(config, pkgName, index) {
  const packages = config.packages.map(p => {
    if (p.name !== pkgName) {
      return p
    }
    return { ...p, wires: (p.wires || []).filter((_, i) => i !== index) }
  })
  return { ...config, packages }
}
