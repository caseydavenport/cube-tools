import React from 'react'

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
  colors.sort(function(a,b) {
    let orderA = order[a]
    let orderB = order[b]
    return orderA - orderB
  })
  return colors.join('')
}

export function ColorImages(colors) {
  // Sort correctly to start. Input may be one of several things:
  // - An array of color primitives. e.g., ["W", "G"]
  // - A single character - "W"
  // - A color string - "WG"
  // Convert them all into an array.
  let canoncialized = [].concat(colors)
  colors = CombineColors(canoncialized)

  return (
    <div>
      {
        colors.split('').map(function(color) {
          let img = "img/mountain.png"
          switch (color) {
            case "W":
              img = "img/plains.png"
              break;
            case "U":
              img = "img/island.png"
              break;
            case "B":
              img = "img/swamp.png"
              break;
            case "R":
              img = "img/mountain.png"
              break;
            case "G":
              img = "img/forest.png"
              break;
          }
          return (
            <img className="mana-symbol" width="24px" height="24px" src={img} />
          )
        }).sort(function(a, b) {
          let orderA = order[a]
          let orderB = order[b]
          return orderA - orderB
        })
      }
    </div>
  )

  let splits = colors.split('')
}
