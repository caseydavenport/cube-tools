// Pure helpers for showing a server win-rate Record, kept free of React so
// node tests can load them. A Record carries wins, losses, draws, the raw
// win %, the Bayes win %, its interval and whether it beats a coin flip.

// AVERAGE_WIN_PERCENT is the win rate every row is compared against: in a
// game somebody wins, so the average deck wins half its games.
const AVERAGE_WIN_PERCENT = 50

// gamesIn is how many games a record covers, draws included.
function gamesIn(record) {
  if (!record) {
    return 0
  }
  return (record.wins || 0) + (record.losses || 0) + (record.draws || 0)
}

// winRateValue is the number a record sorts and shows by: its Bayes win %, or
// null when it has no games.
export function winRateValue(record) {
  if (gamesIn(record) === 0) {
    return null
  }
  return record.bayesian_win_percent
}

// winRateText is the record's Bayes win % rounded for a table cell, or a dash
// when it has no games.
export function winRateText(record) {
  const value = winRateValue(record)
  if (value === null) {
    return "—"
  }
  return `${Math.round(value)}%`
}

// winRateMuted reports whether the cell should be greyed: the record has an
// interval and it can't be told apart from a coin flip.
export function winRateMuted(record) {
  if (gamesIn(record) === 0) {
    return false
  }
  const hasInterval = record.win_percent_high > 0
  return hasInterval && !record.significant
}

// confidencePercent turns a confidence setting like "0.8" into 80, defaulting
// to 80 when none is set.
export function confidencePercent(confidence) {
  const value = parseFloat(confidence || "0.8")
  return Math.round(value * 100)
}

// signedPercent formats a difference like "+8%" or "-3%".
function signedPercent(value) {
  const rounded = Math.round(value)
  if (rounded >= 0) {
    return `+${rounded}%`
  }
  return `${rounded}%`
}

// recordText is "W-L", with "-D" added when there were draws.
function recordText(record) {
  const base = `${record.wins}-${record.losses}`
  if (record.draws > 0) {
    return `${base}-${record.draws}`
  }
  return base
}

// winRateRows are the hover rows behind a win-rate cell: the raw win %, its
// interval at confidencePct, the record, the games and the Bayes rate's
// difference from average. A record with no games has no rows.
export function winRateRows(record, confidencePct) {
  if (gamesIn(record) === 0) {
    return []
  }
  const rows = [
    { label: "Raw win %", value: `${Math.round(record.win_percent)}%`, share: record.win_percent / 100 },
  ]
  if (record.win_percent_high > 0) {
    rows.push({
      label: `${confidencePct}% interval`,
      value: `${Math.round(record.win_percent_low)}–${Math.round(record.win_percent_high)}%`,
    })
  }
  rows.push({ label: "Record", value: recordText(record) })
  rows.push({ label: "Games", value: gamesIn(record) })
  rows.push({ label: "vs average", value: signedPercent(record.bayesian_win_percent - AVERAGE_WIN_PERCENT) })
  return rows
}
