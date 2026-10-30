// The group editor's Scryfall tag picker: a searchable list of the tags on
// the cube's cards, most common first. Picking one adds an otag: condition.

import React from "react"
import { Select } from "@mantine/core"
import { useCubeTags } from "../../stats/useCubeTags.js"
import { tagOptions } from "../../utils/tagOptions.js"

// TagOption draws one tag in the list, with Scryfall's description of it
// in the hover text.
export function TagOption({ option }) {
  return <div title={option.description}>{option.label}</div>
}

// TagPicker loads the cube's tags and calls onPick with the slug of the one
// chosen. It clears itself after each pick, so the same tag can be added again.
export function TagPicker({ cube, onPick }) {
  const options = tagOptions(useCubeTags(cube).tags)

  return (
    <Select
      size="xs"
      label="Add a Scryfall tag"
      placeholder="Search tags"
      data={options}
      value={null}
      onChange={slug => {
        if (slug) {
          onPick(slug)
        }
      }}
      searchable
      nothingFoundMessage="No matching tags"
      renderOption={TagOption}
      comboboxProps={{ withinPortal: false }}
    />
  )
}
