// The card page's partners: the cube cards the rules link to this one,
// grouped by package, each with a link to the decks that played both.

import React, { useState } from "react"
import { Link } from "react-router-dom"
import { UnstyledButton } from "@mantine/core"
import { CardLink } from "../components/CardLink.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { ruleColor } from "../design/map/ruleColors.js"
import { pageHrefWithMatch } from "../shell/paths.js"
import { ColorImages } from "../utils/Colors.js"
import { bothCardsMatch } from "./cardPageModel.js"

// ROWS_SHOWN is how many partners a package shows before "Show all".
const ROWS_SHOWN = 8

// PartnerRow is one partner: its name linking to its own page, its colors, a
// button that compares it with this card, and the decks that played both.
function PartnerRow({ partner, card, links }) {
  const match = bothCardsMatch(card, partner.name)
  return (
    <div className="card-partner-row">
      <CardLink cube={links.cube} name={partner.name} className="card-partner-name" />
      <span className="card-partner-pips">{ColorImages(partner.colors || [])}</span>
      <UnstyledButton className="card-partner-action" onClick={() => links.onCompare(partner.name)}>
        Compare
      </UnstyledButton>
      <Link
        className="card-partner-action"
        to={pageHrefWithMatch(links.cube, "decks", match, links.start, links.end)}
        onClick={() => links.onMatch(match)}
      >
        Decks with both →
      </Link>
    </div>
  )
}

// PackageBlock is one package's partners, showing ROWS_SHOWN until expanded.
function PackageBlock({ group, color, card, links }) {
  const [expanded, setExpanded] = useState(false)
  let shown = group.cards
  if (!expanded) {
    shown = group.cards.slice(0, ROWS_SHOWN)
  }

  return (
    <div className="card-partner-package">
      <div className="card-partner-package-head">
        <span className="dm-swatch" style={{ background: color }} />
        <span className="card-partner-package-name">{group.package}</span>
        <span className="card-partner-count">{group.cards.length}</span>
      </div>
      {shown.map(partner => <PartnerRow key={partner.name} partner={partner} card={card} links={links} />)}
      {!expanded && group.cards.length > ROWS_SHOWN && (
        <UnstyledButton className="card-partner-more" onClick={() => setExpanded(true)}>
          Show all {group.cards.length}
        </UnstyledButton>
      )}
    </div>
  )
}

// CardPartners lists the card's partners by package. links carries the cube,
// date range, onMatch (sets the deck filter as a link is followed) and
// onCompare (puts a partner in the compare section).
export function CardPartners({ page, packageIndex, links }) {
  if (page.partners.length === 0) {
    return null
  }
  const title = (
    <HoverInfo title="Partners" info="Cube cards the rules link to this one, grouped by package. Most played first.">
      <span>Partners</span>
    </HoverInfo>
  )
  return (
    <SectionCard title={title}>
      {page.partners.map(group => (
        <PackageBlock
          key={group.package}
          group={group}
          color={ruleColor(packageIndex[group.package] ?? 0)}
          card={page.card.name}
          links={links}
        />
      ))}
    </SectionCard>
  )
}
