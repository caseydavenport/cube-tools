import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { CardImageURL } from "../utils/Utils.js"
import { CardMatches } from "../utils/Query.js"
import { ColorImages } from "../utils/Colors.js"
import { InDeckColor } from "../utils/Deck.js"
import { decklistColumns } from "./decklist.js"
import "../components/kit/popover.css"

// linkedInDeck returns the names of the cards in this list that a card links to
// in the design map. synergy maps each card name to its links; present is the
// set of names on screen.
function linkedInDeck(name, synergy, present) {
  const linked = new Set()
  if (!synergy) {
    return linked
  }

  for (const link of synergy.get(name) || []) {
    if (link.other !== name && present.has(link.other)) {
      linked.add(link.other)
    }
  }
  return linked
}

// rowClassName picks a decklist row's highlight: a card matching the deck
// filter, a sideboard card the deck could play, and the synergy hover states
// (the hovered card, the cards it links to, and everything else faded).
function rowClassName(card, { deck, sideboard, matchStr, hovered, linked }) {
  let className = "decklist-row"

  if (matchStr && CardMatches(card, matchStr, true)) {
    className += " button-selected"
  } else if (sideboard && deck && InDeckColor(card, deck)) {
    className += " card-playable-highlight"
  }

  if (linked && linked.size > 0) {
    if (hovered === card.name) {
      className += " synergy-source"
    } else if (linked.has(card.name)) {
      className += " synergy-linked"
    } else {
      className += " synergy-dim"
    }
  }
  return className
}

// DecklistRow is one card in a column: its mana icons and name, linking to the
// card's page. Hovering it reports the card up, for the synergy lines.
function DecklistRow({ entry, highlight, onHover, registerNode }) {
  const card = entry.card
  let text = card.name
  if (entry.copies > 1) {
    text = `${entry.copies}x ${card.name}`
  }

  return (
    <a
      ref={el => registerNode(card.name, el)}
      className={rowClassName(card, highlight)}
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => onHover(card.name)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="decklist-pip">{ColorImages(card.colors)}</span>
      <span className="decklist-name">{text}</span>
    </a>
  )
}

// DecklistColumn is one column of the list: its heading with a card count, then
// the cards grouped under small type headings.
function DecklistColumn({ column, highlight, onHover, registerNode }) {
  let className = "decklist-wrapper"
  if (column.key === "lands") {
    className += " decklist-lands"
  }

  return (
    <div className={className}>
      <div className="decklist">
        <div className="decklist-title">{column.label} · {column.count}</div>
        <div className="decklist-body">
          {column.groups.map(group => (
            <div className="type-group" key={group.type}>
              <div className="type-subheading">{group.type}</div>
              {group.cards.map(entry => (
                <DecklistRow
                  key={entry.card.name}
                  entry={entry}
                  highlight={highlight}
                  onHover={onHover}
                  registerNode={registerNode}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// useSynergyLines works out the connector lines drawn from the hovered card to
// each card it links to. Positions are measured from the cards' elements,
// relative to the container, so they line up wherever the page is scrolled.
function useSynergyLines(containerRef, nodeRefs, hovered, linked) {
  const [lines, setLines] = useState([])

  // useLayoutEffect measures after React updates the page but before the
  // browser paints it, so the lines never show in the wrong place.
  useLayoutEffect(() => {
    const source = hovered ? nodeRefs.current.get(hovered) : null
    if (!source || !linked || linked.size === 0 || !containerRef.current) {
      setLines([])
      return
    }

    const box = containerRef.current.getBoundingClientRect()
    const from = source.getBoundingClientRect()
    const x1 = from.left + from.width / 2 - box.left
    const y1 = from.top + from.height / 2 - box.top

    const next = []
    for (const name of linked) {
      const el = nodeRefs.current.get(name)
      if (el) {
        const to = el.getBoundingClientRect()
        next.push({ key: name, x1, y1, x2: to.left + to.width / 2 - box.left, y2: to.top + to.height / 2 - box.top })
      }
    }
    setLines(next)
  }, [hovered, linked])

  return lines
}

// TextDecklist shows a list of cards in mana value columns plus a lands column.
// Hovering a card shows its image and draws lines to the other cards here it
// links to in the cube's design map. deck is null when comparing several decks.
export function TextDecklist({ deck, cards, sideboard, matchStr, synergy }) {
  const [hovered, setHovered] = useState(null)
  const containerRef = useRef(null)

  // A ref holds the card name -> element map, since changing it shouldn't
  // re-render the list.
  const nodeRefs = useRef(new Map())

  // Clear the hover when the cards change (another deck or board), so a stale
  // highlight doesn't linger.
  useEffect(() => {
    setHovered(null)
  }, [cards])

  const columns = useMemo(() => decklistColumns(cards), [cards])
  const byName = useMemo(() => new Map(cards.map(c => [c.name, c])), [cards])
  const present = useMemo(() => new Set(byName.keys()), [byName])
  const linked = useMemo(() => {
    if (!hovered) {
      return null
    }
    return linkedInDeck(hovered, synergy, present)
  }, [hovered, synergy, present])

  const lines = useSynergyLines(containerRef, nodeRefs, hovered, linked)

  // registerNode records each card row's element as it mounts, and forgets it
  // as it unmounts (React calls the ref with null then).
  function registerNode(name, el) {
    if (el) {
      nodeRefs.current.set(name, el)
    } else {
      nodeRefs.current.delete(name)
    }
  }

  const highlight = { deck, sideboard, matchStr, hovered, linked }
  const spellColumns = columns.filter(c => c.key !== "lands")
  const landColumn = columns.find(c => c.key === "lands")
  const hoveredCard = hovered ? byName.get(hovered) : null

  return (
    <div className="deck-cards" ref={containerRef}>
      {lines.length > 0 && (
        <svg className="synergy-lines">
          {lines.map(l => <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
        </svg>
      )}

      <div className="deck-columns">
        {spellColumns.map(column => (
          <DecklistColumn key={column.key} column={column} highlight={highlight} onHover={setHovered} registerNode={registerNode} />
        ))}
      </div>

      {landColumn && (
        <div className="deck-lands">
          <DecklistColumn column={landColumn} highlight={highlight} onHover={setHovered} registerNode={registerNode} />
        </div>
      )}

      {hoveredCard && (
        <div className="deck-hover-preview">
          <img className="kit-card-image" src={CardImageURL(hoveredCard)} alt={hoveredCard.name} />
        </div>
      )}
    </div>
  )
}
