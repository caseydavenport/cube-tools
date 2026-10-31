// The link check's answer for two cards the rules link: one thread per wire,
// with the condition each card matched and ways to change the link.

import React from "react"
import { Link } from "react-router-dom"
import { UnstyledButton } from "@mantine/core"
import { ruleColor } from "../map/ruleColors.js"
import { bothCardsMatch } from "../../cards/cardPageModel.js"
import { editorViewHref, pageHrefWithMatch } from "../../shell/paths.js"

// CARD_ENTRY marks a wire entry that names one card instead of a group.
const CARD_ENTRY = "card:"

// entryName is how a wire entry reads: a group's name, or a card's name for a
// card: entry.
function entryName(entry) {
  if (entry.startsWith(CARD_ENTRY)) {
    return entry.slice(CARD_ENTRY.length)
  }
  return entry
}

// ThreadSide is one end of a thread: the group chip and the condition the
// card matched, with a way to edit the group or drop the card from it.
function ThreadSide({ entry, matched, card, color, cube, onExclude }) {
  const isGroup = !entry.startsWith(CARD_ENTRY)
  return (
    <div className="link-side">
      <span className="kit-chip kit-chip-neutral link-chip">
        <span className="dm-swatch" style={{ background: color }} />
        {entryName(entry)}
      </span>
      {matched && <span className="link-why">{matched}</span>}
      {isGroup && (
        <span className="link-side-actions">
          <Link to={editorViewHref(cube, "g:" + entry)}>Edit group</Link>
          {onExclude && (
            <UnstyledButton className="link-text-button" onClick={() => onExclude(entry, card)}>
              Leave {card} out
            </UnstyledButton>
          )}
        </span>
      )}
    </div>
  )
}

// Thread is one linking wire: the two ends joined by the package's pill.
function Thread({ link, check, color, cube, onExclude }) {
  return (
    <div className="link-thread">
      <ThreadSide entry={link.group_a} matched={link.matched_a} card={check.a.name} color={color} cube={cube} onExclude={onExclude} />
      <span className="link-line" style={{ background: color }} />
      <Link className="link-pill" style={{ background: color }} to={editorViewHref(cube, "p:" + link.package)}>
        {link.package}
      </Link>
      <span className="link-line" style={{ background: color }} />
      <ThreadSide entry={link.group_b} matched={link.matched_b} card={check.b.name} color={color} cube={cube} onExclude={onExclude} />
    </div>
  )
}

// packagesOf names the linking packages, each once.
function packagesOf(links) {
  const names = []
  for (const link of links) {
    if (!names.includes(link.package)) {
      names.push(link.package)
    }
  }
  return names.join(", ")
}

// LinkedView shows how the rules link the two cards. packageIndex colors each
// package as the rest of the app does; onExclude, when set, drops a card
// from a group; nav carries the date range and onLinkMatch.
export function LinkedView({ check, cube, packageIndex, onExclude, nav }) {
  const match = bothCardsMatch(check.a.name, check.b.name)
  return (
    <div className="link-middle">
      <div className="link-verdict">Linked by {packagesOf(check.links)}</div>
      {check.links.map(link => (
        <Thread
          key={`${link.package}/${link.wire}/${link.group_a}/${link.group_b}`}
          link={link}
          check={check}
          color={ruleColor(packageIndex[link.package] ?? 0)}
          cube={cube}
          onExclude={onExclude}
        />
      ))}
      <Link
        className="link-decks"
        to={pageHrefWithMatch(cube, "decks", match, nav.start, nav.end)}
        onClick={() => nav.onLinkMatch(match)}
      >
        Decks with both →
      </Link>
    </div>
  )
}
