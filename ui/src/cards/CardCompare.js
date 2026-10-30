// The card page's two-card compare: pick another card and see how the rules
// link the two, group to group, with the decks that played both.

import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { SectionCard } from "../components/kit/SectionCard.js"
import { Loom } from "../design/Loom.js"
import { CardSearch } from "../design/rules/CardLens.js"
import { pageHrefWithMatch } from "../shell/paths.js"
import { CardImageURL } from "../utils/Utils.js"
import { CardLink } from "../components/CardLink.js"
import { bothCardsMatch, compareLoom } from "./cardPageModel.js"

// useCubeNames loads the cube's distinct card names, for the compare search.
// A cube can hold several copies of a card, such as a fetch land.
function useCubeNames(cube) {
  const [names, setNames] = useState([])
  useEffect(() => {
    fetch(`/api/${cube}/cube`)
      .then(r => r.json())
      .then(body => setNames([...new Set((body.cards || []).map(c => c.name))].sort()))
      .catch(() => setNames([]))
  }, [cube])
  return names
}

// useCompareLinks fetches how the rules link cards a and b, or null while
// loading or when there's no b.
function useCompareLinks(cube, a, b) {
  const [links, setLinks] = useState(null)
  useEffect(() => {
    setLinks(null)
    if (!b) {
      return
    }
    const params = new URLSearchParams({ a, b })
    fetch(`/api/${cube}/stats/card-compare?${params}`)
      .then(r => r.json())
      .then(body => setLinks(body.links || []))
      .catch(() => setLinks([]))
  }, [cube, a, b])
  return links
}

// CompareCard is one side of the compare: the card's image and linked name.
function CompareCard({ cube, name }) {
  return (
    <figure className="card-compare-card">
      <img className="kit-card-image" src={CardImageURL({ name })} alt={name} />
      <figcaption><CardLink cube={cube} name={name} /></figcaption>
    </figure>
  )
}

// CompareBody draws the two cards with the Loom of links between them, or a
// note when no package links them, and the decks that played both.
function CompareBody({ card, vs, links, packageIndex, nav }) {
  if (links === null) {
    return <div className="browse-empty">Loading…</div>
  }

  let middle = <div className="card-compare-none">No package links these two</div>
  if (links.length > 0) {
    const loom = compareLoom(links, packageIndex)
    middle = <Loom left={loom.left} right={loom.right} threads={loom.threads} />
  }

  const match = bothCardsMatch(card, vs)
  return (
    <>
      <div className="card-compare">
        <CompareCard cube={nav.cube} name={card} />
        <div className="card-compare-middle">{middle}</div>
        <CompareCard cube={nav.cube} name={vs} />
      </div>
      <Link
        className="card-compare-decks"
        to={pageHrefWithMatch(nav.cube, "decks", match, nav.start, nav.end)}
        onClick={() => nav.onMatch(match)}
      >
        Decks with both →
      </Link>
    </>
  )
}

// CardCompare is the compare section. vs is the card being compared, kept in
// the URL by the page, and onVs changes it. nav carries the cube, date range
// and onMatch for the decks link.
export function CardCompare({ card, vs, onVs, packageIndex, nav }) {
  const names = useCubeNames(nav.cube)
  const links = useCompareLinks(nav.cube, card, vs)

  return (
    <SectionCard title="Compare with a card">
      <CardSearch value={vs} onPick={onVs} names={names} placeholder="Pick a card to compare" />
      {vs && <CompareBody card={card} vs={vs} links={links} packageIndex={packageIndex} nav={nav} />}
    </SectionCard>
  )
}
