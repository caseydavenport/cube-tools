import React, { useMemo, useState } from "react"
import { ActionIcon, Button, Group, NativeSelect, Text } from "@mantine/core"
import { IconMinus, IconPlus, IconX } from "@tabler/icons-react"
import { ChoiceHeader } from "../../components/Dropdown.js"
import { CardSearch } from "../CardSearch.js"
import { Snippet, statusClass } from "./Snippet.js"

const BASIC_NAMES = ["Plains", "Island", "Swamp", "Mountain", "Forest"]

const SORTS = [
  { value: "confidence", label: "Confidence" },
  { value: "name", label: "Name" },
  { value: "photo", label: "Photo" },
]

// sortEntries orders a list's cards. "confidence" puts the shakiest matches
// first so they get checked, with hand-added cards (no score) last. "photo"
// follows the photos, top to bottom and left to right.
function sortEntries(entries, sort) {
  const sorted = [...entries]
  if (sort === "name") {
    sorted.sort((a, b) => a.card_name.localeCompare(b.card_name))
    return sorted
  }
  if (sort === "photo") {
    sorted.sort((a, b) => {
      const photoA = (a.source && a.source.photo) || ""
      const photoB = (b.source && b.source.photo) || ""
      if (photoA !== photoB) {
        return photoA.localeCompare(photoB)
      }
      const boxA = (a.source && a.source.box) || {}
      const boxB = (b.source && b.source.box) || {}
      return (boxA.Y || 0) - (boxB.Y || 0) || (boxA.X || 0) - (boxB.X || 0)
    })
    return sorted
  }

  const score = (entry) => (entry.score == null ? 1 : entry.score)
  sorted.sort((a, b) => score(a) - score(b))
  return sorted
}

// Confidence is a card's match score with a dot colored by its status. A card
// added by hand has neither and shows a dash.
function Confidence({ status, score }) {
  if (score == null && !status) {
    return <span className="import-confidence" title="Added by hand">–</span>
  }
  return (
    <span className="import-confidence" title={status || ""}>
      <span className={`import-dot ${statusClass(status)}`} />
      {score != null ? score.toFixed(2) : ""}
    </span>
  )
}

// Counter is a count with minus and plus buttons. It never goes below zero.
function Counter({ value, onChange }) {
  return (
    <Group gap={2} wrap="nowrap" className="import-counter">
      <ActionIcon size="sm" variant="default" aria-label="One fewer" onClick={() => onChange(Math.max(0, value - 1))}>
        <IconMinus size={12} />
      </ActionIcon>
      <span className="import-counter-value">{value}</span>
      <ActionIcon size="sm" variant="default" aria-label="One more" onClick={() => onChange(value + 1)}>
        <IconPlus size={12} />
      </ActionIcon>
    </Group>
  )
}

// UnnamedRow is a box no card name matched. It shows the photo's crop large
// enough to read, the closest guesses as quick picks, and a search to name it.
// Naming it moves the card into the list.
function UnnamedRow({ cube, draftId, row, cards, onName, onRemove, photoVersion }) {
  const name = (cardName) => onName(row.photo, row.boxId, cardName)
  const guesses = (row.candidates || []).slice(0, 3)

  return (
    <li className="import-card-row unnamed">
      <Snippet cube={cube} draftId={draftId} source={row.source} photoVersion={photoVersion} width={264} height={64} />
      <div className="import-grow">
        <CardSearch cards={cards} onPick={name} placeholder="Name this card…" chained />
        {guesses.length > 0 && (
          <Group gap={4} mt={4}>
            {guesses.map((guess) => (
              <Button key={guess.name} size="compact-xs" variant="default" onClick={() => name(guess.name)}>
                {guess.name} ({guess.score.toFixed(2)})
              </Button>
            ))}
          </Group>
        )}
      </div>
      <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Remove box" onClick={() => onRemove(row.photo, row.boxId)}>
        <IconX size={14} />
      </ActionIcon>
    </li>
  )
}

// NameChoice picks a card's name from its match and the other close guesses.
function NameChoice({ entry, onChange }) {
  const options = [{ value: entry.card_name, label: entry.card_name }]
  for (const guess of entry.candidates || []) {
    if (guess.name !== entry.card_name) {
      options.push({ value: guess.name, label: `${guess.name} (${guess.score.toFixed(2)})` })
    }
  }
  return (
    <NativeSelect
      size="xs"
      className="import-grow"
      data={options}
      value={entry.card_name}
      onChange={(e) => onChange(entry.card_name, e.target.value)}
    />
  )
}

// Basics edits how many of each basic land the deck plays.
function Basics({ basics, onSetBasic }) {
  let total = 0
  for (const count of Object.values(basics)) {
    total += count
  }

  return (
    <div className="import-basics">
      <Text size="sm" c="dimmed" mb={6}>Basic lands ({total})</Text>
      <Group gap="md">
        {BASIC_NAMES.map((name) => (
          <Group key={name} gap={6} wrap="nowrap">
            <Text size="sm">{name}</Text>
            <Counter value={basics[name] || 0} onChange={(count) => onSetBasic(name, count)} />
          </Group>
        ))}
      </Group>
    </div>
  )
}

// CardList is the list of cards read off a seat's photos, beside the photo.
// Unnamed boxes come first, to be named by hand. Each card shows its crop from
// the photo, its name (switchable to a close guess), match confidence and
// count. Hovering a card highlights its box on the photo and back. target is
// the expected card count; breakdown, when set, replaces the count with a deck
// summary. onSideOut, when set, adds a button that moves a copy to the
// sideboard. basics and onSetBasic add the basic land counters.
export function CardList({
  title, entries, cards, target, breakdown, cube, draftId, photoVersion,
  onSetCount, onRemove, onRename, onAdd,
  unnamed, onNameBox, onRemoveBox,
  basics, onSetBasic,
  hoveredName, setHoveredName,
  onSideOut,
}) {
  const [sort, setSort] = useState("confidence")
  const sorted = useMemo(() => sortEntries(entries, sort), [entries, sort])

  // maxCopies maps each cube card to how many copies the cube holds, to flag a
  // card counted more often than that.
  const maxCopies = useMemo(() => {
    const byName = {}
    for (const card of cards) {
      byName[card.name] = card.max_copies || 1
    }
    return byName
  }, [cards])

  let total = 0
  for (const entry of entries) {
    total += entry.count
  }

  let summary = <Text size="sm" fw={600} c={total === target ? "green" : "yellow"}>{target ? `${total} of ${target}` : total}</Text>
  if (breakdown) {
    summary = <Text size="sm" c="dimmed">{breakdown.cards} cards · {breakdown.lands} lands · {breakdown.basics} basics</Text>
  }

  return (
    <section className="kit-card import-card-list">
      <Group justify="space-between" mb="xs">
        <Text fw={600}>{title}</Text>
        {summary}
      </Group>
      <ChoiceHeader label="Sort" value={sort} options={SORTS} onChange={(e) => setSort(e.target.value)} />

      <ul className="import-card-rows">
        {(unnamed || []).map((row) => (
          <UnnamedRow
            key={row.boxId}
            cube={cube}
            draftId={draftId}
            row={row}
            cards={cards}
            onName={onNameBox}
            onRemove={onRemoveBox}
            photoVersion={photoVersion}
          />
        ))}

        {sorted.map((entry) => {
          const classes = ["import-card-row"]
          if (entry.count > (maxCopies[entry.card_name] || 1)) {
            classes.push("over")
          }
          if (entry.card_name === hoveredName) {
            classes.push("hot")
          }
          return (
            <li
              key={entry.card_name}
              className={classes.join(" ")}
              onMouseEnter={() => setHoveredName(entry.card_name)}
              onMouseLeave={() => setHoveredName(null)}
            >
              <Snippet cube={cube} draftId={draftId} source={entry.source} photoVersion={photoVersion} />
              <NameChoice entry={entry} onChange={onRename} />
              <Confidence status={entry.status} score={entry.score} />
              <Counter value={entry.count} onChange={(count) => onSetCount(entry.card_name, count)} />
              {onSideOut && (
                <Button size="compact-xs" variant="default" onClick={() => onSideOut(entry.card_name)}>Side out</Button>
              )}
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Remove" onClick={() => onRemove(entry.card_name)}>
                <IconX size={14} />
              </ActionIcon>
            </li>
          )
        })}
      </ul>

      <CardSearch cards={cards} onPick={onAdd} />
      {basics && <Basics basics={basics} onSetBasic={onSetBasic} />}
    </section>
  )
}
