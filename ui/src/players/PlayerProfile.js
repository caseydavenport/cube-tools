// A player's profile, shown when their row in the Players table is expanded:
// what they tend to draft, each part linking to another page filtered to them.

import React from "react"
import { Link } from "react-router-dom"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { ColorImages } from "../utils/Colors.js"
import { archetypeLabel } from "../decks/deckModel.js"
import { pageHrefWithMatch } from "../shell/paths.js"
import { PlayerRename } from "./PlayerRename.js"

// MANA_ORDER is the order colors are listed and drawn in.
const MANA_ORDER = ["W", "U", "B", "R", "G"]

// COLOR_NAMES name each color in sentences.
const COLOR_NAMES = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" }

// colorBarSegments turns the player's color shares (percent of their colored
// cards, from the server) into bar segments. share is the labeled percent;
// width is its slice of the bar, since a gold card counts in two colors and
// shares can sum past 100. Colors they never played are left out.
function colorBarSegments(shares) {
  let total = 0
  for (const color of MANA_ORDER) {
    total += shares[color] || 0
  }
  const segments = []
  if (total === 0) {
    return segments
  }
  for (const color of MANA_ORDER) {
    const share = shares[color] || 0
    if (share > 0) {
      segments.push({ color, share: Math.round(share), width: (100 * share) / total })
    }
  }
  return segments
}

// plural writes a count with the singular noun for one, else the plural.
function plural(count, singular, pluralNoun) {
  if (count === 1) {
    return `1 ${singular}`
  }
  return `${count} ${pluralNoun}`
}

// draftSpan is the player's first and last deck dates as "2023-07-16 to
// 2026-06-20", or one date when they have a single deck.
function draftSpan(decks, name) {
  const dates = decks.filter(d => d.player === name).map(d => d.date).sort()
  if (dates.length === 0) {
    return ""
  }
  if (dates[0] === dates[dates.length - 1]) {
    return dates[0]
  }
  return `${dates[0]} to ${dates[dates.length - 1]}`
}

// ProfileSection is one titled part of the profile, with a link to the page
// that shows more of it. link is { href, onClick } from the profile.
function ProfileSection({ title, linkLabel, link, children }) {
  return (
    <div className="players-profile-section">
      <div className="players-profile-head">
        <span className="players-profile-title">{title}</span>
        <Link to={link.href} onClick={link.onClick} className="players-profile-link">{linkLabel}</Link>
      </div>
      {children}
    </div>
  )
}

// ColorsSection shows the player's color mix as a bar with each color's share
// labeled, and the color where they differ most from everyone.
function ColorsSection({ row, link }) {
  const segments = colorBarSegments((row.tendencies || {}).color_shares || {})
  const gap = (row.tendencies || {}).color_gap

  if (segments.length === 0) {
    return (
      <ProfileSection title="Colors drafted" linkLabel="Colors →" link={link}>
        <span className="players-muted">No colored cards yet.</span>
      </ProfileSection>
    )
  }
  return (
    <ProfileSection title="Colors drafted" linkLabel="Colors →" link={link}>
      <div className="players-color-bar">
        {segments.map(s => <div key={s.color} className={`players-color-${s.color}`} style={{ width: `${s.width}%` }} />)}
      </div>
      <div className="players-color-legend">
        {segments.map(s => <span key={s.color}>{ColorImages([s.color])} {s.share}%</span>)}
      </div>
      {gap && (
        <div className="players-muted">
          {COLOR_NAMES[gap.color]} {Math.round(gap.player_share)}% against {Math.round(gap.cube_share)}% for everyone
        </div>
      )}
    </ProfileSection>
  )
}

// MAX_CHIPS is the most chips a profile section shows; the rest are a
// "+N more" chip linking to the page that lists them all.
const MAX_CHIPS = 5

// MoreChip stands for the entries past MAX_CHIPS, linking to the full list.
function MoreChip({ hidden, link }) {
  if (hidden <= 0) {
    return null
  }
  return (
    <Link to={link.href} onClick={link.onClick} className="kit-chip kit-chip-more">
      +{hidden} more
    </Link>
  )
}

// CountChips shows named counts as chips, "Aggro" with a 4 badge, at most
// MAX_CHIPS of them. kind picks the chip color; emptyText shows when there
// are none.
function CountChips({ entries, kind, labelFor, emptyText, link }) {
  if (entries.length === 0) {
    return <span className="players-muted">{emptyText}</span>
  }
  return (
    <div className="kit-chips">
      {entries.slice(0, MAX_CHIPS).map(e => (
        <span key={e.name} className={`kit-chip kit-chip-${kind}`}>
          {labelFor(e.name)}
          <span className="kit-chip-count">{e.count}</span>
        </span>
      ))}
      <MoreChip hidden={entries.length - MAX_CHIPS} link={link} />
    </div>
  )
}

// archetypeName is an archetype's display name.
function archetypeName(name) {
  return archetypeLabel({ macro_archetype: name }) || name
}

// SignatureCards shows the player's signature cards as chips, each badged
// with how many of their decks played it, and the comparison in words on
// hover. The server sends at most MAX_CHIPS.
function SignatureCards({ row, link }) {
  const cards = (row.tendencies || {}).signature_cards || []
  if (cards.length === 0) {
    return <span className="players-muted">None stand out yet.</span>
  }
  return (
    <div className="kit-chips">
      {cards.slice(0, MAX_CHIPS).map(card => {
        const othersShare = Math.round((100 * card.others) / Math.max(1, card.others_available))
        const info = `In ${card.decks} of ${row.name}'s ${card.available} decks; ${othersShare}% of everyone else's.`
        return (
          <HoverInfo key={card.name} title={card.name} info={info}>
            <span className="kit-chip kit-chip-card">
              {card.name}
              <span className="kit-chip-count">{card.decks}/{card.available}</span>
            </span>
          </HoverInfo>
        )
      })}
      <MoreChip hidden={cards.length - MAX_CHIPS} link={link} />
    </div>
  )
}

// PlayerProfile is an expanded player's profile. cube, start and end build
// the links, and onMatch sets the app's deck filter as one is followed; decks
// are the loaded decks, for the player's first and last draft. playerId,
// editable and onRenamed drive the rename control.
export function PlayerProfile({ row, cube, start, end, decks, onMatch, playerId, editable, onRenamed, copy }) {
  const t = row.tendencies || {}
  const match = `player:"${row.name}"`

  // linkTo links to a page filtered to this player. The app reads the URL's
  // filter only on first load, so a click also sets it directly.
  function linkTo(page) {
    return { href: pageHrefWithMatch(cube, page, match, start, end), onClick: () => onMatch(match) }
  }

  const facts = [
    plural(row.num_decks, "draft", "drafts"),
    plural(t.matches || 0, "match", "matches"),
    draftSpan(decks, row.name),
    `${row.wins}-${row.losses} in games`,
  ].filter(Boolean)

  return (
    <div className="players-profile">
      <div className="players-profile-header">
        <PlayerRename player={{ id: playerId, name: row.name }} editable={editable} onRenamed={onRenamed} copy={copy} />
        <span className="players-muted">{facts.join(" · ")}</span>
      </div>

      <div className="players-profile-grid">
        <ColorsSection row={row} link={linkTo("colors")} />
        <ProfileSection title="Archetypes" linkLabel="Their decks →" link={linkTo("decks")}>
          <CountChips entries={t.archetypes || []} kind="archetype" labelFor={archetypeName} emptyText="No archetypes recorded." link={linkTo("decks")} />
        </ProfileSection>
        <ProfileSection title="Packages built" linkLabel="Packages →" link={linkTo("packages")}>
          <CountChips entries={t.packages || []} kind="package" labelFor={name => name} emptyText="No packages built." link={linkTo("packages")} />
        </ProfileSection>
        <ProfileSection title="Signature cards" linkLabel="Cards →" link={linkTo("cards")}>
          <SignatureCards row={row} link={linkTo("cards")} />
        </ProfileSection>
      </div>
    </div>
  )
}
