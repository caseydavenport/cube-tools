export function IDToName(log, id) {
  return log.carddata[id].name
}

export function Drafters(log) {
  let players = new Array()
  for (var userID in log.users) {
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
      return {name: cardName, player: player, pack: pack, pick: pick}
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


export function AllPicks(logs) {
  let allPicks = new Map()
  for (var l in logs) {
    let log = logs[l]
    let [picks, burns] = AllPicksFromLog(log)

    // Add the picks from this log.
    for (var i in picks) {
      let p = picks[i]
      if (!allPicks[p.name]) {
        allPicks.set(p.name, {
          name: p.name,

          // Track total number of picks, and pick number in pack.
          count: 0,
          pickNumSum: 0,
          burns: 0,

          // Specifically track pack one as a separate stat.
          p1count: 0,
          p1burns: 0,
          p1PickNumSum: 0,
          firstPicks: 0,
        })
      }

      // Use 1 to start, since humans think in terms of 1 being first.
      let pickNumHumanReadable = p.pick + 1

      allPicks.get(p.name).count += 1
      allPicks.get(p.name).pickNumSum += pickNumHumanReadable
      if (p.pack == 0) {
        allPicks.get(p.name).p1count += 1
        allPicks.get(p.name).p1PickNumSum += pickNumHumanReadable
        if (p.pick == 0 ) {
          allPicks.get(p.name).firstPicks += 1
        }
      }
    }

    // Add in burn count without incrementing average numbers.
    for (i in burns) {
      let b = burns[i]
      if (!allPicks[b.name]) {
        allPicks.set(b.name, {
          name: b.name,
          burns: 0,
          p1burns: 0,
        })
      }
      allPicks.get(b.name).burns += 1
      if (b.pack == 0) {
        allPicks.get(b.name).p1burns += 1
      }
    }
  }
  return allPicks
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
          console.log(burned)
          burns = burns.concat(burned)
        }
      }
    }
  }

  return [picks, burns]
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
