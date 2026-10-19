import { useEffect, useState } from "react"
import { LoadDecks, SaveDeckMeta, SaveDeckRecord } from "../utils/Fetch.js"
import { fetchPlayers } from "../utils/Players.js"
import { useCubeWritable } from "../utils/useCubeWritable.js"
import { annotationPayload, saveErrorText } from "./deckEdits.js"

// useDeckEdits is how the deck details save changes. editable is true only once
// the cube is known to be writable, so read-only cubes never show a pencil.
// Each save merges what the server sent back into the deck list. A failure is
// reported to the page, not kept here, so it still shows if the viewer has
// moved to another deck by the time the save fails. saving is true while a
// save is in flight, so editors can lock their controls and two quick changes
// can't overwrite each other.
export function useDeckEdits(cube, deck, page) {
  const editable = useCubeWritable(cube) === true
  const [saving, setSaving] = useState(false)

  // run wraps one save: it clears the last error, marks the save in flight, and
  // on failure reports which field failed. It returns whether the save worked,
  // so an editor holding typed text can stay open when it didn't.
  async function run(what, save) {
    page.clearSaveError()
    setSaving(true)
    try {
      page.onDecksUpdated(await save())
      return true
    } catch (err) {
      page.reportSaveError(deck, saveErrorText(what, err))
      return false
    } finally {
      setSaving(false)
    }
  }

  // saveMeta saves the archetype, tags, colors, or notes. what names the field
  // for the error message.
  function saveMeta(what, changes) {
    return run(what, async () => {
      const updated = await SaveDeckMeta(cube, annotationPayload(deck, changes))
      return [updated]
    })
  }

  // saveRecord saves the player or the match record. The server mirrors match
  // results onto the opponents' decks and returns every deck it changed.
  function saveRecord(what, { player_id, matches }) {
    return run(what, () => SaveDeckRecord(cube, {
      draft_id: deck.metadata.draft_id,
      id: deck.id,
      player_id,
      matches,
    }))
  }

  return { editable, saving, saveMeta, saveRecord }
}

// useDraftDecks loads every deck in a deck's draft, ignoring the page's filter,
// so the record and player editors can list opponents and taken players a
// filtered list would hide. It loads only while enabled (an editor is open).
export function useDraftDecks(cube, deck, enabled) {
  const [decks, setDecks] = useState([])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let alive = true
    LoadDecks(cube, list => {
      if (alive) {
        setDecks(list.filter(d => d.metadata.draft_id === deck.metadata.draft_id))
      }
    }, deck.date, deck.date, 0, "", "", "")
    return () => {
      alive = false
    }
  }, [cube, deck.metadata.draft_id, deck.date, enabled])

  return decks
}

// usePlayers loads the global player list for the player picker, only while
// enabled. addPlayer appends a player the picker just created.
export function usePlayers(enabled) {
  const [players, setPlayers] = useState([])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let alive = true
    fetchPlayers()
      .then(list => {
        if (alive) {
          setPlayers(list)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [enabled])

  return { players, addPlayer: player => setPlayers(prev => [...prev, player]) }
}
