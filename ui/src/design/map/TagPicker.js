// The group editor's Scryfall tag picker: a searchable list of the tags on
// the cube's cards, most common first. Picking one adds an otag: condition.

import React from "react"
import { Select } from "@mantine/core"
import { useLoaded } from "../../stats/useLoaded.js"
import { statsUrl } from "../../stats/statsUrls.js"
import { fetchJson } from "../../utils/fetchJson.js"
import { tagOptions } from "./tagOptions.js"

// EMPTY_TAGS is what the picker shows until the cube's tags arrive.
const EMPTY_TAGS = { tags: [] }

// TagOption draws one tag in the list, with Scryfall's description of it
// in the hover text.
function TagOption({ option }) {
  return <div title={option.description}>{option.label}</div>
}

// TagPicker loads the cube's tags and calls onPick with the slug of the one
// chosen. It clears itself after each pick, so the same tag can be added again.
export function TagPicker({ cube, onPick }) {
  const loaded = useLoaded(cube, true, () => fetchJson(statsUrl(cube, "tags", {})), [], EMPTY_TAGS)
  const options = tagOptions(loaded.value.tags)

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
