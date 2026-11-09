import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ActionIcon, Alert, Button, Checkbox, Group, NumberInput, Text } from "@mantine/core"
import { IconX } from "@tabler/icons-react"
import { useCube } from "../../contexts/CubeContext.js"
import { PlayerPicker } from "../../components/PlayerPicker.js"
import { fetchPlayers, matchPlayerByName } from "../../utils/Players.js"
import { checkDecks, commitDraft, loadCubeCards } from "../importApi.js"
import { CardSearch } from "../CardSearch.js"
import { ConsistencyPanel, isProblem } from "../ConsistencyPanel.js"
import { useAction } from "../useAction.js"

// cardList returns the list of a deck that the review edits: its pool for a
// pool-only deck, otherwise its mainboard. The sideboard is kept as parsed.
function cardList(deck) {
  if (deck.pool && deck.pool.length > 0) {
    return deck.pool
  }
  return deck.mainboard || []
}

// withCardList returns a copy of deck with its edited list replaced.
function withCardList(deck, list) {
  if (deck.pool && deck.pool.length > 0) {
    return { ...deck, pool: list }
  }
  return { ...deck, mainboard: list }
}

// setCount sets one card's count in a list, dropping the card at zero.
function setCount(list, name, count) {
  const updated = list.map((card) => {
    if (card.name === name) {
      return { ...card, count: Math.max(0, count) }
    }
    return card
  })
  return updated.filter((card) => card.count > 0)
}

// renameCard renames one card in a list. When the new name is already in the
// list, the two entries merge into one.
function renameCard(list, oldName, newName) {
  const target = list.find((card) => card.name === oldName)
  if (!target) {
    return list
  }

  const existing = list.find((card) => card.name === newName && card !== target)
  if (existing) {
    const merged = list.map((card) => {
      if (card === existing) {
        return { ...card, count: card.count + target.count }
      }
      return card
    })
    return merged.filter((card) => card !== target)
  }

  return list.map((card) => {
    if (card === target) {
      return { ...card, name: newName }
    }
    return card
  })
}

// addCard adds one copy of a card to a list.
function addCard(list, name) {
  const existing = list.find((card) => card.name === name)
  if (!existing) {
    return [...list, { name, count: 1 }]
  }
  return list.map((card) => {
    if (card.name === name) {
      return { ...card, count: card.count + 1 }
    }
    return card
  })
}

// duplicatePlayers returns the names of players picked for more than one deck.
// A player plays one deck per draft, so the server refuses those.
function duplicatePlayers(decks, players) {
  const counts = new Map()
  for (const deck of decks) {
    if (deck.player_id) {
      counts.set(deck.player_id, (counts.get(deck.player_id) || 0) + 1)
    }
  }

  const names = []
  for (const [id, count] of counts) {
    if (count > 1) {
      const player = players.find((p) => p.id === id)
      names.push(player ? player.name : `#${id}`)
    }
  }
  return names
}

// DeckCard is one parsed deck: its player, any parse warnings, and its cards
// with counts, a rename search for names not in the cube, and an add search.
function DeckCard({ deck, cards, players, takenIds, unknownNames, onChange, onPlayer, onPlayerAdded }) {
  const list = cardList(deck)

  // update applies a change to the deck's list and reports the new deck.
  function update(change) {
    onChange(withCardList(deck, change(list)))
  }

  return (
    <section className="kit-card import-deck">
      <Group gap="xs" wrap="wrap">
        <Text size="sm" c="dimmed">Player</Text>
        <PlayerPicker players={players} value={deck.player_id || 0} takenIds={takenIds} onAdded={onPlayerAdded} onChange={onPlayer} />
        {deck.player && !deck.player_id && <Text size="xs" c="dimmed">read as “{deck.player}”</Text>}
        {deck.filename && <Text size="xs" c="dimmed">{deck.filename}</Text>}
      </Group>

      {deck.warnings && deck.warnings.length > 0 && (
        <ul className="import-warnings">
          {deck.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}

      <ul className="import-deck-cards">
        {list.map((card) => {
          const unknown = unknownNames.includes(card.name)
          return (
            <li key={card.name} className={unknown ? "unknown" : ""}>
              <NumberInput
                size="xs"
                w={56}
                min={0}
                hideControls
                value={card.count}
                onChange={(value) => update((l) => setCount(l, card.name, Number(value) || 0))}
              />
              <span className="import-grow">{card.name}</span>
              {unknown && (
                <span className="import-grow">
                  <CardSearch cards={cards} placeholder="Rename to…" onPick={(name) => update((l) => renameCard(l, card.name, name))} />
                </span>
              )}
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Remove" onClick={() => update((l) => setCount(l, card.name, 0))}>
                <IconX size={14} />
              </ActionIcon>
            </li>
          )
        })}
      </ul>

      <CardSearch cards={cards} onPick={(name) => update((l) => addCard(l, name))} />
    </section>
  )
}

// DeckReview shows parsed decks for fixing before they're committed: pick each
// deck's player, fix counts, and rename cards the cube doesn't have. Every edit
// re-checks the decks against the cube list. Committing writes the draft and
// opens it on the Drafts page. event holds the draft's date and event fields.
export function DeckReview({ initialDecks, initialReport, event, onBack }) {
  const cube = useCube()
  const navigate = useNavigate()
  const [decks, setDecks] = useState(initialDecks)
  const [report, setReport] = useState(initialReport)
  const [cards, setCards] = useState([])
  const [players, setPlayers] = useState([])
  const [override, setOverride] = useState(false)
  const commit = useAction()

  useEffect(() => {
    loadCubeCards(cube).then(setCards).catch(() => setCards([]))
  }, [cube])

  // Load the player list, then preselect each deck's player from the name read
  // off its file, when that name is in the list.
  useEffect(() => {
    let alive = true
    fetchPlayers()
      .then((list) => {
        if (!alive) {
          return
        }
        setPlayers(list)
        setDecks((current) => current.map((deck) => {
          if (deck.player_id !== undefined) {
            return deck
          }
          return { ...deck, player_id: matchPlayerByName(list, deck.player) }
        }))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // editDeck replaces one deck and re-checks every deck against the cube. A
  // failed check keeps the previous report.
  async function editDeck(index, deck) {
    const updated = decks.map((d, i) => (i === index ? deck : d))
    setDecks(updated)
    try {
      setReport(await checkDecks(cube, updated))
    } catch {
      // Keep the previous report.
    }
  }

  function setPlayer(index, playerId) {
    setDecks(decks.map((d, i) => (i === index ? { ...d, player_id: playerId } : d)))
  }

  async function save() {
    const draftId = await commit.run(() => commitDraft(cube, {
      date: event.date,
      event_name: event.eventName,
      event_code: event.eventCode,
      decks,
    }))
    if (draftId) {
      navigate(`/${cube}/drafts?draft=${draftId}`)
    }
  }

  const discrepancies = report.discrepancies || []
  const problems = discrepancies.filter(isProblem)
  const unknownNames = problems.filter((d) => d.kind === "unknown").map((d) => d.card_name)
  const duplicates = duplicatePlayers(decks, players)
  const blocked = duplicates.length > 0 || (problems.length > 0 && !override)

  return (
    <>
      <ConsistencyPanel summary={`${report.seen_total} of ${report.cube_total} cube cards entered`} discrepancies={discrepancies} />

      <div className="import-decks">
        {decks.map((deck, i) => (
          <DeckCard
            key={i}
            deck={deck}
            cards={cards}
            players={players}
            takenIds={decks.filter((d, j) => j !== i && d.player_id).map((d) => d.player_id)}
            unknownNames={unknownNames}
            onChange={(updated) => editDeck(i, updated)}
            onPlayer={(id) => setPlayer(i, id)}
            onPlayerAdded={(player) => setPlayers((current) => [...current, player])}
          />
        ))}
      </div>

      {duplicates.length > 0 && (
        <Alert color="red" variant="light">
          {duplicates.join(", ")} {duplicates.length > 1 ? "are" : "is"} picked for more than one deck. Each player plays one deck per draft.
        </Alert>
      )}
      {commit.error && <Alert color="red" variant="light">{commit.error}</Alert>}

      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onBack} disabled={commit.busy}>Back</Button>
        {problems.length > 0 && (
          <Checkbox
            label={`Commit anyway, with ${problems.length} problems`}
            checked={override}
            onChange={(e) => setOverride(e.currentTarget.checked)}
          />
        )}
        <Button onClick={save} loading={commit.busy} disabled={blocked}>Commit draft</Button>
      </Group>
    </>
  )
}
