// Pure helpers for the link check, kept free of React so node tests can load
// them: how a group's uses read, the ways to link two groups, and the rule
// change each way makes. A wire's two sides mean the same thing; "sources"
// and "targets" are only the rules file's keys.

// otherSide is the rules-file key for a wire's other side.
function otherSide(side) {
  if (side === "sources") {
    return "targets"
  }
  return "sources"
}

// usesText names the packages a group is used in, each once, in order.
export function usesText(uses) {
  if (uses.length === 0) {
    return "Not in a package"
  }
  const names = []
  for (const use of uses) {
    if (!names.includes(use.package)) {
      names.push(use.package)
    }
  }
  return names.join(" · ")
}

// otherCardNames lists the cards in byName, a Map keyed by card name, other
// than selected, sorted: the cards to check a link with.
export function otherCardNames(byName, selected) {
  return [...byName.keys()].filter(name => name !== selected).sort()
}

// sameWire reports whether two uses are the same wire of the same package.
function sameWire(a, b) {
  return a.package === b.package && a.wire === b.wire
}

// alreadyLinked reports whether some wire has the two groups on opposite
// sides.
function alreadyLinked(usesA, usesB) {
  for (const a of usesA) {
    for (const b of usesB) {
      if (sameWire(a, b) && a.side !== b.side) {
        return true
      }
    }
  }
  return false
}

// addToWireOptions offers to add group to the other side of each wire that
// holds anchor, skipping wires that already hold group anywhere.
function addToWireOptions(anchor, anchorUses, group, groupUses) {
  const out = []
  for (const use of anchorUses) {
    if (groupUses.some(other => sameWire(use, other))) {
      continue
    }
    out.push({
      kind: "add-to-wire",
      package: use.package,
      wire: use.wire,
      side: otherSide(use.side),
      group,
      label: `Add ${group} to ${use.package} wire ${use.wire + 1}, opposite ${anchor}`,
    })
  }
  return out
}

// linkOptions lists the ways to link groupA and groupB: add either group to
// the other side of a wire that holds the other, then a new wire in a
// package, then a new package. Groups that already link get no options.
export function linkOptions(groupA, usesA, groupB, usesB) {
  if (alreadyLinked(usesA, usesB)) {
    return []
  }
  return [
    ...addToWireOptions(groupA, usesA, groupB, usesB),
    ...addToWireOptions(groupB, usesB, groupA, usesA),
    { kind: "new-wire", label: "Add a new wire to a package" },
    { kind: "new-package", label: "Start a new package" },
  ]
}

// applyLink returns a copy of config with option applied. packageName is
// the package a new wire goes in, or the new package's name. config itself
// is never changed.
export function applyLink(config, option, groupA, groupB, packageName) {
  const next = structuredClone(config)
  const wire = { kind: "enables", sources: [groupA], targets: [groupB] }

  if (option.kind === "new-package") {
    next.packages.push({ name: packageName, wires: [wire] })
    return next
  }

  let name = packageName
  if (option.kind === "add-to-wire") {
    name = option.package
  }
  const pkg = next.packages.find(p => p.name === name)
  if (!pkg) {
    return next
  }
  if (option.kind === "add-to-wire") {
    pkg.wires[option.wire][option.side].push(option.group)
  } else {
    pkg.wires.push(wire)
  }
  return next
}

// applyExclude returns a copy of config with card on group's exclude list,
// once, so the rules stop putting it in that group.
export function applyExclude(config, group, card) {
  const next = structuredClone(config)
  const target = next.groups.find(g => g.name === group)
  if (!target) {
    return next
  }
  const exclude = target.exclude || []
  if (!exclude.includes(card)) {
    target.exclude = [...exclude, card]
  }
  return next
}
