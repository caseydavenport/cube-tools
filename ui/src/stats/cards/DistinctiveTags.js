// The Cards page's "Distinctive tags" panel: the Scryfall tags most
// over-represented in this cube against all of Magic. Clicking one filters
// the cards table to it.

import React from "react"
import { Chip, Group } from "@mantine/core"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { distinctiveLabel } from "../../utils/tagOptions.js"

// DistinctiveTags shows the cube's distinctive tags as chips. selected is the
// tag the table is filtered to, or "" for none; onSelect gets the new filter,
// so clicking the chosen tag again clears it.
export function DistinctiveTags({ tags, selected, onSelect }) {
  if (tags.distinctive.length === 0) {
    return null
  }

  function toggle(slug) {
    if (selected === slug) {
      onSelect("")
    } else {
      onSelect(slug)
    }
  }

  return (
    <SectionCard title="Distinctive tags">
      <Group gap={6}>
        {tags.distinctive.map(row => (
          <Chip
            key={row.slug}
            size="xs"
            checked={selected === row.slug}
            onChange={() => toggle(row.slug)}
            title={row.description}
          >
            {distinctiveLabel(row)}
          </Chip>
        ))}
      </Group>
    </SectionCard>
  )
}
