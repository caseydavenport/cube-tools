import React from "react"
import { ActionIcon, Group, NumberInput, Select } from "@mantine/core"
import { IconSortAscending, IconSortDescending } from "@tabler/icons-react"
import { SettingsPopover } from "../components/kit/SettingsPopover.js"
import { WIN_CONFIDENCE_OPTS } from "../utils/Stats.js"

// SORT_OPTIONS are the orders the player list offers, by the stats column each
// one sorts on.
const SORT_OPTIONS = ["matches", "num_decks", "name", "games", "win_percent", "trophies"]

// SortDirection flips the list's order. Names start A to Z and numbers start
// highest first; flipping reverses either.
function SortDirection({ inverted, onToggle, copy }) {
  let Icon = IconSortDescending
  if (inverted) {
    Icon = IconSortAscending
  }
  return (
    <ActionIcon variant="default" size="lg" aria-label={copy.reverseSort} onClick={onToggle}>
      <Icon size={16} />
    </ActionIcon>
  )
}

// PlayerSettings is the toolbar's settings popover for the Players page: the
// minimum games a player needs to be listed, the confidence behind the win
// rates' intervals and greying, and the list's order.
export function PlayerSettings({ filters, copy }) {
  const sortData = SORT_OPTIONS.map(value => ({ value, label: copy.sortLabels[value] }))

  // Picking a new column starts it in its natural direction.
  function onSort(value) {
    filters.setPlayerSortBy(value)
    filters.setPlayerSortInvert(false)
  }

  return (
    <SettingsPopover label={copy.settings}>
      <NumberInput
        size="xs"
        label={copy.minGames}
        min={0}
        value={filters.minGames}
        onChange={value => filters.setMinGames(Number(value) || 0)}
      />
      <Select
        size="xs"
        label={copy.winConfidence}
        data={WIN_CONFIDENCE_OPTS}
        value={String(filters.winConfidence)}
        onChange={filters.setWinConfidence}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
      />
      <Group gap={4} align="flex-end" wrap="nowrap">
        <Select
          size="xs"
          label={copy.sort}
          data={sortData}
          value={filters.playerSortBy || "matches"}
          onChange={onSort}
          allowDeselect={false}
          comboboxProps={{ withinPortal: false }}
        />
        <SortDirection
          inverted={filters.playerSortInvert}
          onToggle={() => filters.setPlayerSortInvert(!filters.playerSortInvert)}
          copy={copy}
        />
      </Group>
    </SettingsPopover>
  )
}
