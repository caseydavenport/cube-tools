// Which rows the Archetypes section's two tabs show. Kept free of React so
// node tests can load it.

import { macroArchetypes, watermark } from "./archetypeHelpers.js"

// splitArchetypes divides the archetype rows common enough to list into the
// three macro archetypes and the tags.
export function splitArchetypes(archetypeData) {
  const macroData = []
  const microData = []
  for (const arch of archetypeData.values()) {
    if (arch.build_percent < watermark) {
      continue
    }
    if (macroArchetypes.has(arch.type)) {
      macroData.push(arch)
    } else {
      microData.push(arch)
    }
  }
  return { macroData, microData }
}

// shownTab is the tab on screen: tab, unless it's tags and no tag is common
// enough to list.
export function shownTab(tab, hasTags) {
  if (tab === "tags" && hasTags) {
    return "tags"
  }
  return "archetypes"
}
