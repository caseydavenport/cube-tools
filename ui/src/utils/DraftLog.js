import { RemovalMatches } from "../pages/Decks.js"

export function IDToName(log, id) {
  return log.carddata[id].name
}

function PlayerIDToName(log, id) {
  return log.users[id].userName
}

export function Drafters(log) {
  let players = new Array()
  for (var userID in log.users) {
    // Ignore any bot drafters.
    if (log.users[userID].isBot) {
      continue
    }
    players.push(userID)
  }
  return players
}

export function Pick(log, player, pack, pick) {
  for (var idx in log.users[player].picks) {
    let p = log.users[player].picks[idx]
    if (p.packNum == pack && p.pickNum == pick) {
      // TODO: This assumes one pick per-pack, which isn't necessarily true!
      let cardName = IDToName(log, p.booster[p.pick[0]])
      return {
        name: cardName,
        player: PlayerIDToName(log, player),
        pack: pack,
        pick: pick,
        date: log.date,
      }
    }
  }
  return null
}

export function Burned(log, player, pack, pick) {
  for (var idx in log.users[player].picks) {
    let p = log.users[player].picks[idx]
    if (p.packNum == pack && p.pickNum == pick) {
      // Return all of the cards that are NOT the given pick.
      let burns = new Array()
      for (var id in p.booster) {
        // TODO: Also assumes a single pick per pack.
        if (id != p.pick[0]) {
          let cardName = IDToName(log, p.booster[id])
          let card = {name: cardName, player: player, pack: pack, pick: pick}
          burns.push(card)
        }
      }
      return burns
    }
  }
  return null
}


export function AggregatedPickInfo(logs, cube, playerMatch) {
  console.time("AggregatedPickInfo")

  let pickInfo = new Map()

  // Build a map of all the cards in the cube so we can
  // easily skip any cards not currently in the cube.
  let cubeCards = new Map()
  for (var i in cube.cards) {
    cubeCards.set(cube.cards[i].name, cube.cards[i])
  }

  // Define a local function for initializing a blank pick.
  let newPickInfoEntry = function(name) {
    return {
      // The card name.
      name: name,

      // The actual card.
      card: null,

      // Track total number of picks, and pick number in pack.
      count: 0,
      burns: 0,
      pickNumSum: 0,

      // Track absolute data in addition to per-pack data. This
      // let's us track total pick order (e.g., p1p15 vs p3p15).
      pickNumSumAbs: 0,

      // Specifically track pack one as a separate stat.
      p1count: 0,
      p1burns: 0,
      p1PickNumSum: 0,
      firstPicks: 0,

      // Include raw pick information in addition to aggregated
      // statistics.
      picks: new Array()
    }
  }

  for (var l in logs) {
    let log = logs[l]
    let [picks, burns, packInfo] = AllPicksFromLog(log)

    // Add the picks from this log.
    for (var i in picks) {
      let p = picks[i]

      // Skip cards not currently in cube.
      if (!cubeCards.has(p.name)) {
        continue
      }

      if (playerMatch != "") {
        if (!p.player.match(playerMatch)) {
          continue
        }
      }


      // Check if the card matches the given filter, and skip if not.
      // TODO: Make this configurable in the UI.
      // let card = cubeCards.get(p.name)
      // let matched = false
      // for (let match of RemovalMatches) {
      //   if (card.oracle_text.toLowerCase().match(match)){
      //     matched = true
      //     break
      //   }
      // }
      // if (!matched) {
      //   continue
      // }

      if (!pickInfo.get(p.name)) {
        pickInfo.set(p.name, newPickInfoEntry(p.name))
      }

      // Merge in the card data itself to the pick structure.
      pickInfo.get(p.name).card = cubeCards.get(p.name)

      // Add this particular pick to the aggregated data for this card.
      pickInfo.get(p.name).picks.push(p)

      // Use 1 to start, since humans think in terms of 1 being first.
      let pickNumHumanReadable = p.pick + 1

      pickInfo.get(p.name).count += 1
      pickInfo.get(p.name).pickNumSum += pickNumHumanReadable
      pickInfo.get(p.name).pickNumSumAbs += pickNumHumanReadable + (p.pack * packInfo.cardsPerPack)
      if (p.pack == 0) {
        pickInfo.get(p.name).p1count += 1
        pickInfo.get(p.name).p1PickNumSum += pickNumHumanReadable
        if (p.pick == 0 ) {
          pickInfo.get(p.name).firstPicks += 1
        }
      }
    }

    // Add in burn count without incrementing average numbers.
    for (i in burns) {
      let b = burns[i]

      // Skip cards not currently in cube.
      if (!cubeCards.has(b.name)) {
        continue
      }

      // Burned cards have no player, so skip them if we're filtering on a player.
      if (playerMatch != "") {
        continue
      }

      if (!pickInfo.get(b.name)) {
        pickInfo.set(b.name, newPickInfoEntry(b.name))
      }

      // Merge in the card data itself to the pick structure.
      pickInfo.get(b.name).card = cubeCards.get(b.name)

      // Increment the number of burns, but also count this as a "last pick" for
      // pick tracking.
      pickInfo.get(b.name).count += 1
      pickInfo.get(b.name).pickNumSum += packInfo.cardsPerPack
      pickInfo.get(b.name).pickNumSumAbs += packInfo.cardsPerPack + (b.pack * packInfo.cardsPerPack)
      pickInfo.get(b.name).burns += 1
      if (b.pack == 0) {
        pickInfo.get(b.name).p1burns += 1
        pickInfo.get(b.name).p1count += 1
        pickInfo.get(b.name).p1PickNumSum += 15
      }
    }
  }
  console.timeEnd("AggregatedPickInfo")
  return pickInfo
}

export function AllPicksFromLog(log) {
  let allPlayers = Drafters(log)
  let packInfo = NumPacks(log)
  let picks = new Array()
  let burns = new Array()
  let numBurned = packInfo.cardsPerPack - packInfo.picksPerPack

  // First, get cards that were picked.
  for (var packNum = 0; packNum < packInfo.packs; packNum++) {
    for (var pickNum = 0; pickNum < packInfo.picks; pickNum++) {
      for (var i in allPlayers) {
        let player = allPlayers[i]
        let p = Pick(log, player, packNum, pickNum)
        if (p) {
          picks.push(p)
        }

        // If this is the last pick in the pack, add in any remaining
        // cards as burns, since they won't get selected.
        if (pickNum == packInfo.picks - 1) {
          let burned = Burned(log, player, packNum, pickNum)
          burns = burns.concat(burned)
        }
      }
    }
  }

  return [picks, burns, packInfo]
}

export function NumPacks(log) {
  let cardsPerPack = 0
  let picksPerPack = 0
  let packsMap = new Map()
  let u = Object.keys(log.users)[0]
  for (var p in log.users[u].picks) {
    let pack = log.users[u].picks[p]
    packsMap.set(pack.packNum, true)

    if (cardsPerPack == 0) {
      // We only need to do this once, on the first booster.
      cardsPerPack = Object.keys(pack.booster).length;
    }

    // For the first pack, count the total number of picks.
    if (pack.packNum == 0) {
      picksPerPack += 1
    }
  }
  return {packs: packsMap.size, picks: picksPerPack, cardsPerPack: cardsPerPack}
}
