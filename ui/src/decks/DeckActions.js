import React, { useState } from "react"
import { ActionIcon, Button, Select, Tooltip } from "@mantine/core"
import { IconChevronLeft, IconChevronRight, IconColumns, IconCopy } from "@tabler/icons-react"
import { SettingsPopover } from "../components/kit/SettingsPopover.js"
import { copyListText, deckRef, resolveSelectedDeck } from "./deckModel.js"

// COPIED_TOOLTIP_MS is how long "Copied" shows after copying a list.
const COPIED_TOOLTIP_MS = 1500

// CopyListButton copies the selected deck's mainboard in "2x Card Name" form,
// then briefly shows a "Copied" tooltip.
function CopyListButton({ deck, copy }) {
  const [copied, setCopied] = useState(false)

  async function onClick() {
    try {
      await navigator.clipboard.writeText(copyListText(deck.mainboard))
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_TOOLTIP_MS)
    } catch (err) {
      console.error("Failed to copy deck: ", err)
    }
  }

  return (
    <Tooltip label={copy.copied} opened={copied}>
      <Button variant="default" size="xs" leftSection={<IconCopy size={14} />} onClick={onClick} disabled={!deck}>
        {copy.copyList}
      </Button>
    </Tooltip>
  )
}

// neighborRef returns the ref of the deck before (step -1) or after (step 1) the
// selected one in the list, or null at either end.
function neighborRef(decks, selectedRef, step) {
  const index = decks.findIndex(d => deckRef(d) === selectedRef)
  const next = index + step
  if (index === -1 || next < 0 || next >= decks.length) {
    return null
  }
  return deckRef(decks[next])
}

// SortSettings is the settings popover with the list's sort order.
function SortSettings({ page, copy }) {
  return (
    <SettingsPopover label={copy.settings}>
      <Select
        size="xs"
        label={copy.sort}
        value={page.sort}
        onChange={value => page.setSort(value)}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        data={[
          { label: copy.sortDate, value: "date" },
          { label: copy.sortPlayer, value: "player" },
          { label: copy.sortRecord, value: "record" },
          { label: copy.sortArchetype, value: "archetype" },
        ]}
      />
    </SettingsPopover>
  )
}

// DeckActions are the Decks page's toolbar buttons: copy the list, compare
// mode, step to the previous or next deck, and the sort settings.
export function DeckActions({ page, compareMode, onToggleCompare, copy }) {
  const selected = resolveSelectedDeck(page.decks, page.selection.selectedRef)
  const previous = neighborRef(page.sortedDecks, page.selection.selectedRef, -1)
  const next = neighborRef(page.sortedDecks, page.selection.selectedRef, 1)

  let compareVariant = "default"
  if (compareMode) {
    compareVariant = "light"
  }

  return (
    <>
      <CopyListButton deck={selected.deck} copy={copy} />
      <Button variant={compareVariant} size="xs" leftSection={<IconColumns size={14} />} onClick={onToggleCompare}>
        {copy.compare}
      </Button>
      <ActionIcon variant="default" size="md" aria-label={copy.previous} disabled={!previous} onClick={() => page.selection.select(previous)}>
        <IconChevronLeft size={16} />
      </ActionIcon>
      <ActionIcon variant="default" size="md" aria-label={copy.next} disabled={!next} onClick={() => page.selection.select(next)}>
        <IconChevronRight size={16} />
      </ActionIcon>
      <SortSettings page={page} copy={copy} />
    </>
  )
}
