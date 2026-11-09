import React, { useEffect, useMemo, useRef, useState } from "react"
import { Alert, Badge, Button, Group, Text } from "@mantine/core"
import { TabNav } from "../../components/PageSections.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { detectPhoto, loadDraftCards, loadSession, matchRegion, rotatePhoto, saveSession, confirmSeat } from "../importApi.js"
import { errorText } from "../useAction.js"
import { CardList } from "./CardList.js"
import { ConfirmSlideshow } from "./ConfirmSlideshow.js"
import { PhotoViewer } from "./PhotoViewer.js"
import { basicCountsInBoxes, boxCountByName, deriveList, resolvedCaptures, unmatchedRows } from "./reconcile.js"
import { previewSideboard } from "./sideboard.js"

// SAVE_DELAY_MS is how long the workspace waits after the last edit before
// saving, so a burst of edits saves once.
const SAVE_DELAY_MS = 800

// dedupeBoxes drops repeated box ids within each photo, keeping the first. Two
// entries with one id are the same box saved twice; kept, they'd clash as
// React keys and count the card twice.
function dedupeBoxes(boxesByPhoto) {
  const out = {}
  for (const [photo, boxes] of Object.entries(boxesByPhoto || {})) {
    const seen = new Set()
    out[photo] = (boxes || []).filter((box) => {
      if (seen.has(box.id)) {
        return false
      }
      seen.add(box.id)
      return true
    })
  }
  return out
}

// maxManualId finds the highest hand-drawn box number ("…:m<N>") in the given
// box maps, so new boxes number on from there.
function maxManualId(...boxMaps) {
  let max = 0
  for (const boxesByPhoto of boxMaps) {
    for (const boxes of Object.values(boxesByPhoto || {})) {
      for (const box of boxes || []) {
        const match = /:m(\d+)$/.exec(box.id || "")
        if (match) {
          max = Math.max(max, Number(match[1]))
        }
      }
    }
  }
  return max
}

// addBasics adds a {name: count} change into the basic land counts, never
// going below zero. sign -1 takes a photo's old boxes back out.
function addBasics(current, change, sign = 1) {
  const next = { ...current }
  for (const [name, count] of Object.entries(change)) {
    next[name] = Math.max(0, (next[name] || 0) + sign * count)
  }
  return next
}

// linesToBoxes turns a photo's detected lines into boxes.
function linesToBoxes(photo, lines) {
  return (lines || []).map((line, i) => ({
    id: `${photo}:${i}`,
    bbox: line.bbox,
    status: line.confidence_band,
    chosen: line.chosen || "",
    candidates: line.candidates || [],
  }))
}

// countsByName maps each card in a list to its count.
function countsByName(entries) {
  const counts = {}
  for (const entry of entries) {
    counts[entry.card_name] = entry.count
  }
  return counts
}

// asCounted turns list entries into the {name, count} pairs the server takes.
function asCounted(entries) {
  return entries.map((entry) => ({ name: entry.card_name, count: entry.count }))
}

// patchBox changes one box on one photo.
function patchBox(boxesByPhoto, photo, id, change) {
  const boxes = (boxesByPhoto[photo] || []).map((box) => (box.id === id ? { ...box, ...change } : box))
  return { ...boxesByPhoto, [photo]: boxes }
}

// mapBoxes applies change to every box on every photo.
function mapBoxes(boxesByPhoto, change) {
  const next = {}
  for (const [photo, boxes] of Object.entries(boxesByPhoto)) {
    next[photo] = change(boxes)
  }
  return next
}

// Warnings is a badge counting the deck's warnings, with the list on hover.
// It sits in the tab row, so warnings coming and going don't move the page.
function Warnings({ items }) {
  if (!items || items.length === 0) {
    return null
  }
  const list = (
    <ul className="import-warnings">
      {items.map((warning) => <li key={warning}>{warning}</li>)}
    </ul>
  )
  return (
    <HoverInfo title="Warnings" info={list} position="bottom" width={360}>
      <Badge color="yellow" variant="light">{items.length} warning{items.length === 1 ? "" : "s"}</Badge>
    </HoverInfo>
  )
}

// SideboardList lists the deck's sideboard, each card with a button to bring
// a copy back into the main deck.
function SideboardList({ entries, hoveredName, setHoveredName, onBringIn }) {
  let total = 0
  for (const entry of entries) {
    total += entry.count
  }

  return (
    <section className="kit-card import-card-list">
      <Text fw={600} mb="xs">Sideboard ({total})</Text>
      <ul className="import-card-rows">
        {entries.map((entry) => (
          <li
            key={entry.card_name}
            className={entry.card_name === hoveredName ? "import-card-row hot" : "import-card-row"}
            onMouseEnter={() => setHoveredName(entry.card_name)}
            onMouseLeave={() => setHoveredName(null)}
          >
            <span className="import-grow">{entry.count} {entry.card_name}</span>
            <Button size="compact-xs" variant="default" onClick={() => onBringIn(entry.card_name)}>Bring in</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// SeatWorkspace is where one seat's cards are read off its photos and checked:
// the Pool tab for the check-in and check-out photos of all 45 picks, the Deck
// tab for the deck photo, and the Confirm tab for a last card-by-card check
// before the deck is written. Work saves itself as you go. A seat with only a
// deck photo skips the Pool tab and tracks its sideboard by hand.
export function SeatWorkspace({ cube, draft, seat, onConfirmed }) {
  const draftId = draft.draft.id
  const poolPhotos = [...(seat.photos.checkin || []), ...(seat.photos.checkout || [])]
  const deckPhotos = seat.photos.deck || []
  const deckOnly = poolPhotos.length === 0

  // Boxes per photo, for the pool and deck photos. Overrides are counts set by
  // hand, which win over the counts read from boxes.
  const [boxes, setBoxes] = useState({})
  const [deckBoxes, setDeckBoxes] = useState({})
  const [overrides, setOverrides] = useState({})
  const [deckOverrides, setDeckOverrides] = useState({})
  const [basics, setBasics] = useState({})
  const [cards, setCards] = useState([])

  // Without pool photos there's no pool to work the sideboard out from, so
  // cards sided out of the deck are counted here by hand.
  const [sideboard, setSideboard] = useState({})

  const [tab, setTab] = useState(deckOnly ? "deck" : "pool")
  const [poolPhoto, setPoolPhoto] = useState(poolPhotos[0] || null)
  const [deckPhoto, setDeckPhoto] = useState(deckPhotos[0] || null)
  const [hoveredName, setHoveredName] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")

  // The server's warnings and deck summary, refreshed with every save.
  const [review, setReview] = useState(null)

  // A rotation counter per photo. Rotating rewrites the file, and bumping the
  // counter makes the browser load the new one.
  const [photoVersions, setPhotoVersions] = useState({})
  const photoVersion = (photo) => photoVersions[photo] || 0

  // skipSave is set while the saved work loads in, so filling the workspace
  // from the server doesn't save it straight back. Saving would mark a
  // confirmed seat as in progress just for being opened.
  const skipSave = useRef(false)

  const idCounter = useRef(0)
  const nextId = () => {
    idCounter.current += 1
    return `m${idCounter.current}`
  }

  const pool = useMemo(() => deriveList(boxes, overrides), [boxes, overrides])
  const mainboard = useMemo(() => deriveList(deckBoxes, deckOverrides), [deckBoxes, deckOverrides])
  const mainCount = useMemo(() => countsByName(mainboard), [mainboard])

  // The sideboard is the pool minus the main deck, or the hand count when
  // there's no pool.
  const sideboardList = useMemo(() => {
    if (!deckOnly) {
      return previewSideboard(pool, mainboard)
    }
    const entries = []
    for (const [name, count] of Object.entries(sideboard)) {
      if (count > 0) {
        entries.push({ card_name: name, count })
      }
    }
    entries.sort((a, b) => a.card_name.localeCompare(b.card_name))
    return entries
  }, [deckOnly, sideboard, pool, mainboard])
  const sideboardNames = useMemo(() => new Set(sideboardList.map((entry) => entry.card_name)), [sideboardList])

  // Every named box, pool then deck, for the confirm check.
  const captures = useMemo(() => [
    ...resolvedCaptures(boxes).map((capture) => ({ ...capture, group: "Pool" })),
    ...resolvedCaptures(deckBoxes).map((capture) => ({ ...capture, group: "Main deck" })),
  ], [boxes, deckBoxes])

  // Load the cube's cards and this seat's saved work.
  useEffect(() => {
    loadDraftCards(cube, draftId).then(setCards).catch((e) => setError(errorText(e)))
    loadSession(cube, draftId)
      .then((session) => {
        setReview((session.reviews && session.reviews[seat.id]) || null)
        const work = session.players && session.players[seat.id]
        if (work) {
          skipSave.current = true
          const poolBoxes = dedupeBoxes(work.boxes)
          const savedDeckBoxes = dedupeBoxes(work.deck_boxes)
          setBoxes(poolBoxes)
          setDeckBoxes(savedDeckBoxes)
          setOverrides(work.overrides || {})
          setDeckOverrides(work.deck_overrides || {})
          setBasics(work.basics || {})
          setSideboard(work.sideboard || {})

          // Number new boxes past the saved ones, so ids never repeat.
          idCounter.current = maxManualId(poolBoxes, savedDeckBoxes)
        }
        setLoaded(true)
      })
      .catch((e) => setError(`Couldn't load this seat's saved work: ${errorText(e)}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube, draftId, seat.id])

  // Save shortly after each edit. Nothing saves until the saved work has
  // loaded, so an empty start can't overwrite it, and the load itself
  // doesn't count as an edit.
  useEffect(() => {
    if (!loaded) {
      return undefined
    }
    if (skipSave.current) {
      skipSave.current = false
      return undefined
    }
    const timer = setTimeout(() => {
      const work = {
        status: "in_progress",
        boxes, deck_boxes: deckBoxes, overrides, deck_overrides: deckOverrides, basics, sideboard,
        pool_entries: pool, mainboard_entries: mainboard,
      }
      saveSession(cube, draftId, { draft_id: draftId, players: { [seat.id]: work } })
        .then((session) => {
          if (session.reviews && session.reviews[seat.id]) {
            setReview(session.reviews[seat.id])
          }
        })
        .catch((e) => setError(`Couldn't save: ${errorText(e)}`))
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes, deckBoxes, overrides, deckOverrides, basics, sideboard])

  // boxOps builds the box edits for the pool or deck photos. Adding or
  // resizing a box reads its card name again.
  function boxOps(setBoxMap) {
    async function readName(photo, id, bbox) {
      try {
        const line = await matchRegion(cube, draftId, photo, bbox)
        setBoxMap((current) => patchBox(current, photo, id, {
          status: line.confidence_band,
          chosen: line.chosen || "",
          candidates: line.candidates || [],
          bbox: line.bbox || bbox,
        }))
      } catch {
        setBoxMap((current) => patchBox(current, photo, id, { status: "unmatched" }))
      }
    }

    return {
      add(photo, bbox) {
        const id = `${photo}:${nextId()}`
        const box = { id, bbox, status: "pending", chosen: "", candidates: [] }
        setBoxMap((current) => ({ ...current, [photo]: [...(current[photo] || []), box] }))
        readName(photo, id, bbox)
      },
      resize(photo, id, bbox) {
        setBoxMap((current) => patchBox(current, photo, id, { bbox, status: "pending" }))
        readName(photo, id, bbox)
      },
      remove(photo, id) {
        setBoxMap((current) => ({ ...current, [photo]: (current[photo] || []).filter((box) => box.id !== id) }))
      },

      // name sets a box's card by hand. It counts as a confident match, since
      // a person picked it.
      name(photo, id, cardName) {
        setBoxMap((current) => patchBox(current, photo, id, { chosen: cardName, status: "high" }))
      },
    }
  }
  const poolBoxOps = boxOps(setBoxes)
  const deckBoxOps = boxOps(setDeckBoxes)

  // listOps builds the edits for the pool or main deck list. A hand-set count
  // replaces the count read from boxes rather than adding to it.
  function listOps(setBoxMap, setOverrideMap, readCounts) {
    return {
      setCount(name, count) {
        setOverrideMap((current) => ({ ...current, [name]: count }))
      },
      add(name) {
        setOverrideMap((current) => {
          let count = readCounts[name] || 0
          if (name in current) {
            count = current[name]
          }
          return { ...current, [name]: count + 1 }
        })
      },
      remove(name) {
        setBoxMap((current) => mapBoxes(current, (photoBoxes) => photoBoxes.filter((box) => box.chosen !== name)))
        setOverrideMap((current) => {
          const next = { ...current }
          delete next[name]
          return next
        })
      },
      rename(oldName, newName) {
        setBoxMap((current) => mapBoxes(current, (photoBoxes) => photoBoxes.map((box) => (box.chosen === oldName ? { ...box, chosen: newName } : box))))
        setOverrideMap((current) => {
          if (!(oldName in current)) {
            return current
          }
          const next = { ...current, [newName]: current[oldName] }
          delete next[oldName]
          return next
        })
      },
    }
  }
  const poolList = listOps(setBoxes, setOverrides, boxCountByName(boxes))
  const deckList = listOps(setDeckBoxes, setDeckOverrides, boxCountByName(deckBoxes))

  // isDeck says whether a box map setter is the deck photos'. Deck photos also
  // feed the basic land counts.
  const isDeck = (setBoxMap) => setBoxMap === setDeckBoxes

  // scan reads every card name on one photo, replacing its boxes after asking
  // first. Photos aren't scanned on their own, so a sideways photo can be
  // rotated before it's read.
  async function scan(setBoxMap, photo, existing) {
    if (!photo || working) {
      return
    }
    if ((existing || []).length > 0 && !window.confirm("Scan this photo again? This replaces its boxes.")) {
      return
    }

    setWorking(true)
    setError("")
    try {
      const detected = linesToBoxes(photo, await detectPhoto(cube, draftId, photo))
      setBoxMap((current) => ({ ...current, [photo]: detected }))
      if (isDeck(setBoxMap)) {
        setBasics((current) => addBasics(addBasics(current, basicCountsInBoxes(existing), -1), basicCountsInBoxes(detected)))
      }
    } catch (e) {
      setError(`Couldn't scan the photo: ${errorText(e)}`)
    } finally {
      setWorking(false)
    }
  }

  // rotate turns a photo 90 degrees. Its boxes no longer line up, so they go.
  async function rotate(setBoxMap, photo, existing, direction) {
    if (!photo || working) {
      return
    }

    setWorking(true)
    setError("")
    try {
      await rotatePhoto(cube, draftId, photo, direction)
      setPhotoVersions((current) => ({ ...current, [photo]: (current[photo] || 0) + 1 }))
      setBoxMap((current) => ({ ...current, [photo]: [] }))
      if (isDeck(setBoxMap)) {
        setBasics((current) => addBasics(current, basicCountsInBoxes(existing), -1))
      }
    } catch (e) {
      setError(`Couldn't rotate the photo: ${errorText(e)}`)
    } finally {
      setWorking(false)
    }
  }

  // clear removes every box from one photo, after asking.
  function clear(setBoxMap, photo, existing) {
    if (!photo || !(existing || []).length) {
      return
    }
    if (!window.confirm("Clear every box from this photo?")) {
      return
    }
    setBoxMap((current) => ({ ...current, [photo]: [] }))
    if (isDeck(setBoxMap)) {
      setBasics((current) => addBasics(current, basicCountsInBoxes(existing), -1))
    }
  }

  // sideOut moves copies of cards from the main deck to the sideboard, one per
  // name given, never more than the deck holds. With a pool the sideboard
  // follows on its own; without one it's counted by hand.
  function sideOut(names) {
    const wanted = {}
    for (const name of names) {
      wanted[name] = (wanted[name] || 0) + 1
    }
    for (const [name, count] of Object.entries(wanted)) {
      const inDeck = mainCount[name] || 0
      const moved = Math.min(count, inDeck)
      if (moved <= 0) {
        continue
      }
      setDeckOverrides((current) => ({ ...current, [name]: inDeck - moved }))
      if (deckOnly) {
        setSideboard((current) => ({ ...current, [name]: (current[name] || 0) + moved }))
      }
    }
  }

  // bringIn moves one copy of a card from the sideboard to the main deck.
  function bringIn(name) {
    setDeckOverrides((current) => ({ ...current, [name]: (mainCount[name] || 0) + 1 }))
    if (deckOnly) {
      setSideboard((current) => ({ ...current, [name]: (current[name] || 0) - 1 }))
    }
  }

  // correctCapture renames one box from the confirm check, in its own list.
  function correctCapture(capture, name) {
    const ops = capture.group === "Pool" ? poolBoxOps : deckBoxOps
    ops.name(capture.photo, capture.key, name)
  }

  // confirm writes the seat's deck. A seat with no main deck and no basics
  // writes its pool alone.
  async function confirm() {
    let payload = { pool: asCounted(pool) }
    const hasBasics = Object.values(basics).some((count) => count > 0)
    if (mainboard.length > 0 || hasBasics) {
      payload = { pool: asCounted(pool), mainboard: asCounted(mainboard), sideboard: asCounted(sideboardList), basics }
    }

    setWorking(true)
    setError("")
    try {
      await confirmSeat(cube, draftId, seat.id, payload)
      await onConfirmed()
    } catch (e) {
      setError(`Couldn't write the deck: ${errorText(e)}`)
      setWorking(false)
    }
  }

  const warnings = review ? review.warnings : []
  const breakdown = review ? review.breakdown : { cards: 0, lands: 0, basics: 0 }

  let poolTotal = 0
  for (const entry of pool) {
    poolTotal += entry.count
  }

  const tabs = [
    { id: "deck", label: "Deck" },
    { id: "confirm", label: "Confirm" },
  ]
  if (!deckOnly) {
    tabs.unshift({ id: "pool", label: "Pool" })
  }

  const setBasic = (name, count) => setBasics((current) => ({ ...current, [name]: count }))

  return (
    <div className="import-workspace">
      <Group justify="space-between" wrap="nowrap">
        <TabNav tabs={tabs} active={tab} onChange={setTab} />
        <Warnings items={warnings} />
      </Group>

      {error && <Alert color="red" variant="light" withCloseButton onClose={() => setError("")}>{error}</Alert>}

      {tab === "pool" && (
        <div className="import-columns">
          <div className="import-photo-column">
            {poolPhoto && (
              <PhotoViewer
                cube={cube} draftId={draftId} photo={poolPhoto} photos={poolPhotos} onSelectPhoto={setPoolPhoto}
                boxes={boxes[poolPhoto]} hoveredName={hoveredName} setHoveredName={setHoveredName}
                onDrawBox={(bbox) => poolBoxOps.add(poolPhoto, bbox)}
                onResizeBox={(id, bbox) => poolBoxOps.resize(poolPhoto, id, bbox)}
                onDeleteBox={(id) => poolBoxOps.remove(poolPhoto, id)}
                onScan={() => scan(setBoxes, poolPhoto, boxes[poolPhoto])}
                onRotate={(direction) => rotate(setBoxes, poolPhoto, boxes[poolPhoto], direction)}
                onClear={() => clear(setBoxes, poolPhoto, boxes[poolPhoto])}
                sideboardNames={sideboardNames} working={working} photoVersion={photoVersion}
              />
            )}
          </div>
          <div className="import-list-column">
            <CardList
              title="Pool" entries={pool} cards={cards} target={45} cube={cube} draftId={draftId} photoVersion={photoVersion}
              hoveredName={hoveredName} setHoveredName={setHoveredName}
              onSetCount={poolList.setCount} onRemove={poolList.remove} onRename={poolList.rename} onAdd={poolList.add}
              unnamed={unmatchedRows(boxes)} onNameBox={poolBoxOps.name} onRemoveBox={poolBoxOps.remove}
              basics={basics} onSetBasic={setBasic}
            />
          </div>
        </div>
      )}

      {tab === "deck" && (
        <div className="import-columns">
          <div className="import-photo-column">
            {deckPhoto && (
              <PhotoViewer
                cube={cube} draftId={draftId} photo={deckPhoto} photos={deckPhotos} onSelectPhoto={setDeckPhoto}
                boxes={deckBoxes[deckPhoto]} hoveredName={hoveredName} setHoveredName={setHoveredName}
                onDrawBox={(bbox) => deckBoxOps.add(deckPhoto, bbox)}
                onResizeBox={(id, bbox) => deckBoxOps.resize(deckPhoto, id, bbox)}
                onDeleteBox={(id) => deckBoxOps.remove(deckPhoto, id)}
                onScan={() => scan(setDeckBoxes, deckPhoto, deckBoxes[deckPhoto])}
                onRotate={(direction) => rotate(setDeckBoxes, deckPhoto, deckBoxes[deckPhoto], direction)}
                onClear={() => clear(setDeckBoxes, deckPhoto, deckBoxes[deckPhoto])}
                onSideOut={sideOut}
                sideboardNames={sideboardNames} working={working} photoVersion={photoVersion}
              />
            )}
          </div>
          <div className="import-list-column">
            <CardList
              title="Main deck" entries={mainboard} cards={cards} breakdown={breakdown} cube={cube} draftId={draftId} photoVersion={photoVersion}
              hoveredName={hoveredName} setHoveredName={setHoveredName}
              onSetCount={deckList.setCount} onRemove={deckList.remove} onRename={deckList.rename} onAdd={deckList.add}
              unnamed={unmatchedRows(deckBoxes)} onNameBox={deckBoxOps.name} onRemoveBox={deckBoxOps.remove}
              onSideOut={(name) => sideOut([name])}
              basics={basics} onSetBasic={setBasic}
            />
            <SideboardList entries={sideboardList} hoveredName={hoveredName} setHoveredName={setHoveredName} onBringIn={bringIn} />
          </div>
        </div>
      )}

      {tab === "confirm" && (
        <section className="kit-card import-confirm">
          <Text>
            Pool: {poolTotal} cards. Main deck: {breakdown.cards} cards ({breakdown.lands} lands, {breakdown.basics} basics).
          </Text>
          <ConfirmSlideshow captures={captures} cards={cards} cube={cube} draftId={draftId} photoVersion={photoVersion} onCorrect={correctCapture} />
          <Group>
            <Button onClick={confirm} loading={working}>Confirm and write deck</Button>
          </Group>
        </section>
      )}
    </div>
  )
}
