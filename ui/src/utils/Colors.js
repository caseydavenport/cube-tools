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

        // Triomes.
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

// CombineColors returns the canonical name for the color pairing,
// so that we don't double count. e.g., UB and BU.
export function CombineColors(colors) {
  colors.sort(function(a,b) {
    let order = {
      "W": 0,
      "U": 1,
      "B": 2,
      "R": 3,
      "G": 4,
    }
    let orderA = order[a]
    let orderB = order[b]
    return orderA - orderB
  })
  return colors.join('')
}
