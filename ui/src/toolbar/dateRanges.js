// The date range presets the page toolbar offers, and how a range is labeled.
// Dates are "YYYY-MM-DD" strings throughout, worked on as text rather than Date
// objects so the viewer's time zone can't shift a day. Tested in
// dateRanges.test.mjs.

// ALL_TIME_START is the start of the "All time" range, early enough to come
// before any draft. It's the same value InitialDates() uses as the default.
export const ALL_TIME_START = "1990-09-15"

// oneYearEarlier returns the same calendar day a year before date. Feb 29 has no
// match in the year before, so it becomes Feb 28.
function oneYearEarlier(date) {
  const year = Number(date.slice(0, 4)) - 1
  let monthDay = date.slice(4)
  if (monthDay === "-02-29") {
    monthDay = "-02-28"
  }
  return `${year}${monthDay}`
}

// presetRange returns the start and end dates of a preset: "all" for all time,
// or "12m" for the last 12 months. Both end today.
export function presetRange(preset, today) {
  if (preset === "12m") {
    return { start: oneYearEarlier(today), end: today }
  }
  return { start: ALL_TIME_START, end: today }
}

// rangePreset returns the preset a range matches ("all" or "12m"), or null when
// it's a custom range.
export function rangePreset(start, end, today) {
  for (const preset of ["all", "12m"]) {
    const range = presetRange(preset, today)
    if (range.start === start && range.end === end) {
      return preset
    }
  }
  return null
}

// rangeLabel is the text the date range menu's button shows: the preset's name,
// or the two dates of a custom range.
export function rangeLabel(start, end, today, copy) {
  const preset = rangePreset(start, end, today)
  if (preset === "all") {
    return copy.allTime
  }
  if (preset === "12m") {
    return copy.last12Months
  }
  return `${start} – ${end}`
}
