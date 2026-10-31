// The Packages index's Table view: one row per package, with how often decks
// built it, had its cards, and how the builders did. /stats/packages computes
// every number.

import React from "react"
import { Link } from "react-router-dom"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { HoverStats } from "../components/kit/HoverStats.js"
import { ShareBar } from "../components/kit/ShareBar.js"
import { WinRateCell } from "../components/kit/WinRateCell.js"
import { SortHeader } from "../stats/sortHeader.js"
import { compareBy } from "../stats/sortOrder.js"
import { packageMatch, packagePageHref, pageHrefWithMatch } from "../shell/paths.js"
import { builtInText, cameTogetherText, sortValue } from "./packagesModel.js"

// RarelyTogetherTag marks a package whose cards show up but rarely form it.
export function RarelyTogetherTag() {
  return (
    <HoverInfo info="Decks often had its cards, but built it far less often than the typical package.">
      <span className="packages-rarely-tag">Rarely comes together</span>
    </HoverInfo>
  )
}

// BuiltInCell shows how many decks built the package, with a bar for the share
// and the interval on hover.
function BuiltInCell({ stat, populated, confidence }) {
  const level = Math.round(parseFloat(confidence || "0.8") * 100)
  const low = Math.round(stat.buildRateLow * 100)
  const high = Math.round(stat.buildRateHigh * 100)
  const rows = [{ label: `${level}% interval`, value: `${low}–${high}%` }]
  return (
    <HoverStats title={`${stat.package} of ${populated} decks built it`} rows={rows}>
      <td className="page-right-cell">
        {builtInText(stat)}
        <ShareBar share={stat.buildRate} />
      </td>
    </HoverStats>
  )
}

// PackageRow is one package's row. nav carries the cube, date range and
// onLinkMatch, which sets the deck filter as the Decks link is followed.
function PackageRow({ stat, data, nav, confidence, showGames }) {
  const match = packageMatch(stat.name)
  return (
    <tr className="widget-table-row">
      <td className="header-cell stats-bold">
        <Link to={packagePageHref(nav.cube, stat.name)} className="packages-name">{stat.name}</Link>
        {stat.rarelyTogether && <RarelyTogetherTag />}
      </td>
      <BuiltInCell stat={stat} populated={data.populatedDecks} confidence={confidence} />
      <td className="page-right-cell">{stat.has3}</td>
      <td className="page-right-cell">
        {cameTogetherText(stat)}
        <ShareBar share={stat.cameTogether} />
      </td>
      {showGames && <WinRateCell record={stat.record} confidence={confidence} />}
      <td className="page-right-cell">
        <Link
          className="packages-decks-link"
          to={pageHrefWithMatch(nav.cube, "decks", match, nav.start, nav.end)}
          onClick={() => nav.onLinkMatch(match)}
        >
          Decks →
        </Link>
      </td>
    </tr>
  )
}

// PackagesTable is the sortable table. sort and setSort hold the sorted
// column; showGames is false for a cube that records no results.
export function PackagesTable({ data, nav, confidence, sort, setSort, showGames }) {
  if (data.packages.length === 0) {
    return <div className="browse-empty">No packages in the rules yet.</div>
  }
  if (data.populatedDecks === 0) {
    return <div className="browse-empty">No decks match.</div>
  }

  const rows = [...data.packages].sort(compareBy(stat => sortValue(sort.key, stat), sort.dir))

  // header is one column's sortable header cell.
  function header(key, label, tip, numeric = true) {
    return <SortHeader sortKey={key} label={label} tip={tip} sort={sort} setSort={setSort} numeric={numeric} />
  }

  return (
    <div className="stats-table-wrap">
      <table className="widget-table stats-full-width">
        <thead>
          <tr>
            {header("name", "Package", undefined, false)}
            {header("built", "Built in", "Decks with 2 or more cards on each side of one of its wires, 3 or more in all.")}
            {header("had", "Had the cards", "Decks carrying at least three of its cards, built or not.")}
            {header("together", "Came together", "How often the cards, once in a deck, formed the package.")}
            {showGames && header("games", "Games won", "Bayes win % of the decks that built it. Hover a cell for the raw rate, interval and record.")}
            <th className="header-cell" />
          </tr>
        </thead>
        <tbody>
          {rows.map(stat => (
            <PackageRow key={stat.name} stat={stat} data={data} nav={nav} confidence={confidence} showGames={showGames} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
