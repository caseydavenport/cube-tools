// The search language's help: the grammar basics and every keyword a search
// target accepts, read from the server's keyword table so it can't drift from
// what the parser does.

import React from "react"
import { ActionIcon, Popover, ScrollArea } from "@mantine/core"
import { useSearchKeywords } from "./useSearch.js"
import "./search.css"

// GRAMMAR is the syntax every search shares, as Scryfall writes it.
const GRAMMAR = [
  { code: "t:creature mv<=2", text: "Terms separated by spaces must all match." },
  { code: "t:instant or t:sorcery", text: "or matches either side." },
  { code: "(c:u or c:b) is:removal", text: "Parentheses group terms." },
  { code: "-t:land", text: "A leading - negates a term or a group." },
  { code: "bolt", text: "A bare word searches card names." },
  { code: '!"Lightning Bolt"', text: "! before a name matches it exactly." },
  { code: 'o:"draw a card"', text: "Quotes keep spaces in a value; * is a wildcard." },
]

// DECK_GRAMMAR explains how card terms apply to a whole deck.
const DECK_GRAMMAR = [
  { code: "t:creature mv<2", text: "Each card term needs some card in the deck." },
  { code: "(t:creature mv<2)", text: "A group of card terms needs one card to match it all." },
]

// SCOPE_TITLES head the keyword groups.
const SCOPE_TITLES = { card: "Card keywords", stat: "Play stats", deck: "Deck keywords" }

// keywordNames shows a keyword with its aliases, such as "mv / cmc".
function keywordNames(kw) {
  return [kw.name, ...(kw.aliases || [])].join(" / ")
}

// SearchSyntax lists the grammar and the target's keywords. compact drops the
// descriptions into hover tips, for a narrow panel.
export function SearchSyntax({ target, compact = false }) {
  const keywords = useSearchKeywords(target)
  let grammar = GRAMMAR
  if (target === "decks") {
    grammar = GRAMMAR.concat(DECK_GRAMMAR)
  }

  const scopes = ["card", "stat", "deck"].filter(scope => keywords.some(kw => kw.scope === scope))
  return (
    <div className={compact ? "search-help search-help-compact" : "search-help"}>
      <div className="search-help-title">Syntax</div>
      {grammar.map(row => (
        <div key={row.code} className="search-help-row" title={compact ? row.text : undefined}>
          <code>{row.code}</code>
          {!compact && <span>{row.text}</span>}
        </div>
      ))}
      {scopes.map(scope => (
        <React.Fragment key={scope}>
          <div className="search-help-title">{SCOPE_TITLES[scope]}</div>
          {keywords.filter(kw => kw.scope === scope).map(kw => (
            <div key={kw.name} className="search-help-row" title={compact ? kw.description : undefined}>
              <code>{keywordNames(kw)}</code>
              {compact && <code className="search-help-example">{kw.example}</code>}
              {!compact && (
                <span>
                  {kw.description}
                  <code className="search-help-example">{kw.example}</code>
                </span>
              )}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  )
}

// SearchHelpButton is the search bar's ? button, opening the help.
export function SearchHelpButton({ target }) {
  return (
    <Popover position="bottom-end" shadow="md" width={560}>
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Search syntax"
          title="Search syntax"
          onClick={e => e.stopPropagation()}
        >
          ?
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <ScrollArea.Autosize mah="60vh">
          <SearchSyntax target={target} />
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  )
}
