import React from "react"
import { ActionIcon, Text } from "@mantine/core"
import { IconRefresh } from "@tabler/icons-react"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { SettingsPopover } from "../components/kit/SettingsPopover.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { statsSummary } from "./statsSummary.js"
import "./stats.css"

// SummaryLine is the muted count of drafts, decks, and players the page's
// numbers come from, after the date range and deck filter.
function SummaryLine({ decks, copy }) {
  const summary = statsSummary(decks)
  return (
    <Text size="sm" c="dimmed" className="stats-summary">
      {summary.drafts} {copy.drafts} · {summary.decks} {copy.decks} · {summary.players} {copy.players}
    </Text>
  )
}

// StatsToolbar is the page toolbar shared by the stats pages. Its filters are
// the date range menu, the deck filter, and a summary of what they let
// through; its actions are Refresh and a settings popover holding settings.
// props are the app-wide date props; filterSuggestions feeds the filter's
// autocomplete with card, player, and archetype names.
export function StatsToolbar({ title, props, filter, onFilterChange, settings, onRefresh, decks, filterSuggestions, copy }) {
  const actions = (
    <>
      <ActionIcon variant="default" size="md" aria-label={copy.refresh} onClick={onRefresh}>
        <IconRefresh size={16} />
      </ActionIcon>
      <SettingsPopover label={copy.settings}>{settings}</SettingsPopover>
    </>
  )

  return (
    <PageToolbar title={title} actions={actions}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={copy} />
      <PillSearchInput
        placeholder={copy.filterPlaceholder}
        value={filter}
        cardNames={filterSuggestions.cardNames}
        playerNames={filterSuggestions.playerNames}
        archetypes={filterSuggestions.archetypes}
        onChange={onFilterChange}
      />
      <SummaryLine decks={decks} copy={copy} />
    </PageToolbar>
  )
}
