import React from "react"
import { CardImagePreview } from "../components/kit/CardImagePreview.js"
import { CardImageURL } from "../utils/Utils.js"
import { CardMatches } from "../utils/Query.js"
import { InDeckColor } from "../utils/Deck.js"
import { CMC_COLUMNS, LAND_ORDER, cmcColumn, focusClass, getType, isLand, landCategory } from "./decklist.js"
import { Link } from "react-router-dom"
import { useCube } from "../contexts/CubeContext.js"
import { cardPageHref } from "../shell/paths.js"

// CARDS_PER_STACK is how many card images stack in one column before a group
// wraps into another.
const CARDS_PER_STACK = 15

// byTypeThenName orders card images by card type, then by name.
function byTypeThenName(a, b) {
  const typeOrder = getType(a).localeCompare(getType(b))
  if (typeOrder !== 0) {
    return typeOrder
  }
  return a.name.localeCompare(b.name)
}

// chunk splits a list into pieces of at most size items.
function chunk(list, size) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }
  return chunks
}

// imageClassName highlights a card matching the deck filter, or a sideboard card
// the deck could play, and lights or fades it for a focused group of cards.
function imageClassName(card, deck, sideboard, matchStr, focus) {
  let className = "cardimage"
  if (matchStr && CardMatches(card, matchStr, true)) {
    className += " button-selected"
  } else if (sideboard && InDeckColor(card, deck)) {
    className += " card-playable-highlight"
  }
  return className + focusClass(card.name, focus)
}

// CardImage is one card's image, with a larger copy beside it on hover.
function CardImage({ card, className }) {
  const cube = useCube()
  return (
    <div className="card-stack-item">
      <CardImagePreview src={CardImageURL(card)} alt={card.name} width={300} position="right">
        <Link to={cardPageHref(cube, card.name)}>
          <img src={CardImageURL(card)} alt={card.name} className={className + " decklist-image"} />
        </Link>
      </CardImagePreview>
    </div>
  )
}

// ImageGroup is one titled group of card images, such as all the 2 mana spells
// or the basic lands, stacked in columns.
function ImageGroup({ title, cards, deck, sideboard, matchStr, focus }) {
  if (cards.length === 0) {
    return null
  }

  const sorted = [...cards].sort(byTypeThenName)

  return (
    <div className="deck-images-group">
      <div className="deck-images-title">{title} · {cards.length}</div>
      <div className="card-stacks-container">
        {chunk(sorted, CARDS_PER_STACK).map((stack, i) => (
          <div className="card-stack" key={i}>
            {stack.map((card, j) => (
              <CardImage key={card.name + j} card={card} className={imageClassName(card, deck, sideboard, matchStr, focus)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ImageDecklist shows a board as card images: one group per mana value range,
// then one per land role.
export function ImageDecklist({ deck, cards, sideboard, matchStr, focus }) {
  const spells = cards.filter(card => !isLand(card))
  const lands = cards.filter(isLand)
  const shared = { deck, sideboard, matchStr, focus }

  return (
    <>
      <div className="deck-images-columns">
        {CMC_COLUMNS.map(key => (
          <ImageGroup key={key} title={key} cards={spells.filter(card => cmcColumn(card) === key)} {...shared} />
        ))}
      </div>
      <div className="deck-images-columns">
        {LAND_ORDER.map(role => (
          <ImageGroup key={role} title={role} cards={lands.filter(card => landCategory(card) === role)} {...shared} />
        ))}
      </div>
    </>
  )
}
