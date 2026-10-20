// The hover card on a Cards table row: how often the card made the
// mainboard, and which archetypes played it.

import React from 'react'
import { SortFunc, CardImageURL } from "../../utils/Utils.js"
import { hasData } from "../../utils/dataKinds.js"
import { CARDS_COPY } from "./copy.js"

// CardMainboardTooltipContent is the card name popover: the card image, a
// table of the players who mainboarded or sideboarded it, and its archetype
// counts. The sideboard column only shows for cubes that record sideboards.
export function CardMainboardTooltipContent(card, info) {
  let mainboarders = []
  let players = Object.entries(card.players)
  for (let [name, num] of players) {
    mainboarders.push({name: name, mb: num, sb: 0})
  }
  let sideboarders = Object.entries(card.sideboarders)
  for (let [name, num] of sideboarders) {
    // Check if an entry exists for this name.
    let found = false
    for (let entry of mainboarders) {
      if (name === entry.name) {
        entry.sb = num
        found = true
      }
    }
    if (!found) {
      // Add a new entry.
      mainboarders.push({name: name, mb: 0, sb: num})
    }
  }

  // Archetype labels this card has been mainboarded in, sorted by count.
  let labels = Object.entries(card.archetypes || {})
    .map(([name, num]) => ({name: name, num: num}))
    .sort((a, b) => b.num - a.num)

  // The # SB column needs sideboards, which some cubes don't record.
  const showSideboard = hasData(info, "sideboards")
  let sideboardHeader = null
  if (showSideboard) {
    sideboardHeader = <th style={{"padding": "4px 8px", "textAlign": "center"}}>{CARDS_COPY.tooltip.sideboardCount}</th>
  }

  return (
    <div style={{"display": "flex", "flexDirection": "row", "gap": "12px", "alignItems": "flex-start"}}>
      <img
        src={CardImageURL(card)}
        alt={card.name}
        style={{width: '200px', display: 'block', borderRadius: '8px', flexShrink: 0}}
      />
      <table style={{"borderCollapse": "collapse", "fontSize": "0.85rem", "width": "100%"}}>
        <thead>
          <tr style={{"borderBottom": "2px solid var(--border)", "textAlign": "left", "color": "var(--text-muted)"}}>
            <th style={{"padding": "4px 8px"}}>{CARDS_COPY.tooltip.player}</th>
            <th style={{"padding": "4px 8px", "textAlign": "center"}}>{CARDS_COPY.tooltip.mainboardCount}</th>
            {sideboardHeader}
          </tr>
        </thead>
        <tbody>
        {
          mainboarders.map(function(row) {
            let sideboardCell = null
            if (showSideboard) {
              sideboardCell = <td style={{"padding": "4px 8px", "textAlign": "center"}}>{row.sb}</td>
            }
            return (
              <tr sort={row.num} key={row.name} style={{"borderBottom": "1px solid var(--border)"}}>
                <td style={{"padding": "4px 8px", "whiteSpace": "nowrap"}}>{row.name}</td>
                <td style={{"padding": "4px 8px", "textAlign": "center"}}>{row.mb}</td>
                {sideboardCell}
              </tr>
            );
          }).sort(SortFunc)
        }
        </tbody>
      </table>
      <ArchetypeCounts labels={labels} info={info} />
    </div>
  );
}

// ArchetypeCounts is the name popover's table of the archetype tags on decks
// that mainboarded the card. Cubes without archetype labels don't show it.
function ArchetypeCounts({ labels, info }) {
  if (!hasData(info, "archetypes")) {
    return null
  }

  return (
    <table style={{"borderCollapse": "collapse", "fontSize": "0.85rem", "width": "100%"}}>
      <thead>
        <tr style={{"borderBottom": "2px solid var(--border)", "textAlign": "left", "color": "var(--text-muted)"}}>
          <th style={{"padding": "4px 8px"}}>{CARDS_COPY.tooltip.archetype}</th>
          <th style={{"padding": "4px 8px", "textAlign": "center"}}>{CARDS_COPY.tooltip.mainboardCount}</th>
        </tr>
      </thead>
      <tbody>
      {
        labels.map(function(row) {
          return (
            <tr key={row.name} style={{"borderBottom": "1px solid var(--border)"}}>
              <td style={{"padding": "4px 8px", "whiteSpace": "nowrap"}}>{row.name}</td>
              <td style={{"padding": "4px 8px", "textAlign": "center"}}>{row.num}</td>
            </tr>
          );
        })
      }
      </tbody>
    </table>
  );
}
