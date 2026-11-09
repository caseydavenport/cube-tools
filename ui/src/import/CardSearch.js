import React, { useState } from "react"
import { TextInput, UnstyledButton } from "@mantine/core"

// MAX_MATCHES caps how many cards the search lists at once.
const MAX_MATCHES = 8

// CHAIN_CLASS marks the search inputs that form a keyboard chain (see below).
const CHAIN_CLASS = "import-search-chain"

// findMatches returns the cards whose name contains the query, ignoring case.
// A query under two letters matches nothing, so the list doesn't flash open on
// the first keystroke.
function findMatches(cards, query) {
  if (query.length < 2) {
    return []
  }
  const needle = query.toLowerCase()
  return cards.filter((card) => card.name.toLowerCase().includes(needle)).slice(0, MAX_MATCHES)
}

// chainInputs lists the chained search inputs on the page, in page order.
function chainInputs() {
  return Array.from(document.querySelectorAll(`input.${CHAIN_CLASS}`))
}

// CardSearch is a text box that finds a cube card by name and hands the picked
// name to onPick. Arrow keys move through the matches and Enter picks one.
//
// With chained set, the box joins a chain of searches down a list of unnamed
// cards: Tab and Shift-Tab jump straight between them, and picking a card
// moves focus to the next one, so a whole column can be named from the
// keyboard.
export function CardSearch({ cards, onPick, placeholder = "Add a card…", chained, autoFocus }) {
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(0)

  const matches = findMatches(cards, query)

  // highlighted can point past the end after the query narrows the list.
  const active = Math.min(highlighted, matches.length - 1)

  // pick reports a name and clears the box. In a chain, the picked row leaves
  // the list and the rows below shift up, so the next unnamed card's input
  // lands where this one was; focus it once the list re-renders.
  function pick(name, input) {
    onPick(name)
    setQuery("")
    setHighlighted(0)

    if (!chained || !input) {
      return
    }
    const position = chainInputs().indexOf(input)
    requestAnimationFrame(() => {
      const inputs = chainInputs()
      const next = inputs[position] || inputs[inputs.length - 1]
      if (next) {
        next.focus()
      }
    })
  }

  // moveInChain focuses the next or previous search in the chain.
  function moveInChain(e) {
    const inputs = chainInputs()
    const position = inputs.indexOf(e.target)
    if (position === -1) {
      return
    }
    let step = 1
    if (e.shiftKey) {
      step = -1
    }
    const next = inputs[position + step]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  function onKeyDown(e) {
    if (matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlighted(Math.min(active + 1, matches.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlighted(Math.max(active - 1, 0))
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        pick(matches[active].name, e.target)
        return
      }
    }
    if (chained && e.key === "Tab") {
      moveInChain(e)
    }
  }

  let inputClass
  if (chained) {
    inputClass = CHAIN_CLASS
  }

  return (
    <div className="import-search">
      <TextInput
        size="xs"
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        classNames={{ input: inputClass }}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlighted(0)
        }}
        onKeyDown={onKeyDown}
      />
      {matches.length > 0 && (
        <ul className="import-search-matches">
          {matches.map((card, i) => (
            <li key={card.name}>
              <UnstyledButton
                className={i === active ? "import-search-match active" : "import-search-match"}
                onClick={() => pick(card.name)}
              >
                {card.name}
              </UnstyledButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
