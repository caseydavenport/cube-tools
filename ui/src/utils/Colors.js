import React from 'react'
import { CountManaPips } from './Utils.js'

// GetColorIdentity returns all the color identities of this deck.
// e.g., a WUG deck will return [W, U, G, WU, WG, UG, WUG]
export function GetColorIdentity(deck) {
    let allColors = new Map()
    for (var j in deck.colors) {
      let c = deck.colors[j]
      allColors.set(c, true)

      // Dual-colors.
      for (var k in deck.colors) {
        let c2 = deck.colors[k]
        let pair = CombineColors([c, c2])
        if (c === c2) {
          continue
        }
        allColors.set(pair, true)

        // Trios.
        for (var l in deck.colors) {
          let c3 = deck.colors[l]
          let trio = CombineColors([c, c2, c3])
          if (c3 === c || c3 === c2) {
            continue
          }
          allColors.set(trio, true)
        }
      }
    }
    return Array.from(allColors.keys())
}

let order = {
 "W": 0,
 "U": 1,
 "B": 2,
 "R": 3,
 "G": 4,
}

// CUBE_AVG_WIN_PERCENT is the baseline every performance delta is measured against.
// Every game played in the cube is one deck's win and another's loss, so the
// pool-wide win rate is exactly 50%. A color/card/archetype above this line is a
// net positive; below it is a net negative.
export const CUBE_AVG_WIN_PERCENT = 50

// Shared red/green fills for performance-delta visuals. Green when a row beats the
// cube-wide average win rate, red when it trails. Matches the matchup heatmap palette.
export const deltaPositiveFill = "rgba(40, 167, 69, 0.85)"
export const deltaNegativeFill = "rgba(220, 53, 69, 0.85)"

export let White = "#f3e29d"
export let Blue = "#80c1e7"
export let Black = "#9c91c9"
export let Red = "#f08676"
export let Green = "#93c775"
export let Colors = new Map([
  ["W", White],
  ["U", Blue],
  ["B", Black],
  ["R", Red],
  ["G", Green],
])

// CombineColors returns the canonical name for the color pairing,
// so that we don't double count. e.g., UB and BU.
export function CombineColors(colors) {
  if (!colors) return "";
  let arr = Array.isArray(colors) ? [...colors] : colors.split("");
  arr.sort(function(a,b) {
    let orderA = order[a.toUpperCase()] || 0
    let orderB = order[b.toUpperCase()] || 0
    return orderA - orderB
  })
  return arr.join('').toUpperCase()
}

// splashPipRatio is the fraction of the weaker main color's pips below which an
// extra color counts as a splash. Mirror of PrimaryColorPair in pkg/types/deck.go.
const splashPipRatio = 0.5

// primaryColorPair returns the deck's two primary colors if the deck has 3+ colors
// but plays like a two-color deck with splash(es). Colors are ranked by colored mana
// pips across the deck's spells (hybrids count toward each color they name, matching
// the pip bar); the top two are the candidate pair. If every other color is a splash -
// fewer than half the pips of the weaker main color - we collapse to the pair.
// Otherwise it's a genuine multi-color deck and we return null.
export function primaryColorPair(deck) {
  if (!deck.colors || deck.colors.length < 3) {
    return null
  }

  // Tally colored pips per color, restricted to the deck's colors so off-color
  // hybrid halves don't invent a third color.
  let allPips = CountManaPips(deck.mainboard)
  let pips = {}
  for (let c of deck.colors) {
    pips[c] = allPips[c] || 0
  }

  // Rank the deck's colors by pips descending, breaking ties by WUBRG order.
  let sorted = [...deck.colors].sort((a, b) => {
    if (pips[b] !== pips[a]) return pips[b] - pips[a]
    return order[a] - order[b]
  })

  // Every color past the top two must be a splash for the pair to hold.
  let threshold = pips[sorted[1]] * splashPipRatio
  for (let i = 2; i < sorted.length; i++) {
    if (pips[sorted[i]] >= threshold) {
      return null
    }
  }

  return CombineColors([sorted[0], sorted[1]])
}

// pipImgSrc maps a single color to its mana-symbol image. Anything that isn't a
// color (including "X") falls back to the colorless symbol.
function pipImgSrc(color) {
  switch (color) {
    case "W": return "img/plains.png"
    case "U": return "img/island.png"
    case "B": return "img/swamp.png"
    case "R": return "img/mountain.png"
    case "G": return "img/forest.png"
    default:  return "img/colorless.svg"
  }
}

// ManaPipBar renders a proportional stacked bar of colored mana symbol counts,
// e.g. the output of Utils.CountManaPips. Each segment is one color, ordered
// most to least pips, its width proportional to that color's share, labeled with
// the pip icon and count. Colors with zero pips are dropped; returns null when
// there are no colored pips at all.
export function ManaPipBar({counts}) {
  if (!counts) return null
  let entries = ["W", "U", "B", "R", "G"]
    .map((c) => [c, counts[c] || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  let total = entries.reduce((sum, [, n]) => sum + n, 0)
  if (total === 0) return null

  return (
    <div className="mana-pip-bar" title="Colored mana symbols among spells">
      <div className="mana-pip-bar-track">
        {entries.map(([color, n]) => (
          <div
            key={color}
            className="mana-pip-seg"
            style={{flexGrow: n, backgroundColor: Colors.get(color)}}
          >
            <img className="mana-symbol" width="16px" height="16px" src={pipImgSrc(color)} />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ColorImages(colors) {
  // Sort correctly to start. Input may be one of several things:
  // - An array of color primitives. e.g., ["W", "G"]
  // - A single character - "W"
  // - A color string - "WG"
  // Convert them all into an array.
  let canoncialized = [].concat(colors)
  colors = CombineColors(canoncialized)

  // If no colors, return colorless symbol.
  if (colors.length === 0) {
    colors = "X"
  }

  return (
    <div id={colors}>
      {
        colors.split('').map(function(color) {
          let img = pipImgSrc(color)
          return (
            <img id={color} key={color} className="mana-symbol" width="24px" height="24px" src={img} />
          )
        }).sort(function(a, b) {
          let orderA = order[a]
          let orderB = order[b]
          return orderA - orderB
        })
      }
    </div>
  )
}
