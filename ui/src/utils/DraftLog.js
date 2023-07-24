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

export function AllPicks(logs) {
  let allPicks = new Map()
  for (var l in logs) {
    let log = logs[l]
    let picks = AllPicksFromLog(log)
    for (var i in picks) {
      let p = picks[i]
      if (!allPicks[p.name]) {
        allPicks.set(p.name, {
          name: p.name,

          // Track total number of picks, and pick number in pack.
          count: 0,
          pickNumSum: 0,

          // Specifically track pack one as a separate stat.
          p1count: 0,
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
  }
  return allPicks
}

export function AllPicksFromLog(log) {
  let allPlayers = Drafters(log)
  let packInfo = NumPacks(log)
  let picks = new Array()

  for (var packNum = 0; packNum < packInfo.packs; packNum++) {
    for (var pickNum = 0; pickNum < packInfo.picks; pickNum++) {
      for (var i in allPlayers) {
        let player = allPlayers[i]
        let p = Pick(log, player, packNum, pickNum)
        if (p) {
          picks.push(p)
        }
      }
    }
  }
  return picks
}

export function NumPacks(log) {
  let picks = 0
  let packsMap = new Map()
  for (var u in log.users) {
    for (var p in log.users[u].picks) {
      let pack = log.users[u].picks[p]
      packsMap.set(pack.packNum, true)

      if (picks == 0) {
        picks = Object.keys(pack.booster).length;
      }
    }

    // We only need to look at the first user.
    break
  }

  return {packs: packsMap.size, picks: picks}
}
