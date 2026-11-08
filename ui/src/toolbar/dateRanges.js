// The date range presets the page toolbar offers, and how a range is labeled.
// Dates are "YYYY-MM-DD" strings throughout, worked on as text rather than Date
// objects so the viewer's time zone can't shift a day. Tested in
// dateRanges.test.mjs.

// ALL_TIME_START is the start of the "All time" range, early enough to come
// before any draft. It's also where the app's default range starts.
export const ALL_TIME_START = "1990-09-15"

// todayString returns a date as "YYYY-MM-DD" in the viewer's own time zone,
// so "today" is the day on the viewer's calendar.
export function todayString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// initialDates returns the app's default date range, [start, end]: all time,
// up to today.
export function initialDates(today) {
  return [ALL_TIME_START, today]
}

// PRESETS are the named ranges the menu offers, in menu order. years is how
// far back the range starts from today; 0 means all time.
export const PRESETS = [
  { id: "all", label: "All time", years: 0 },
  { id: "12m", label: "Last 12 months", years: 1 },
  { id: "24m", label: "Last 24 months", years: 2 },
]

// yearsEarlier returns the same calendar day years before date. Feb 29 has
// no match in a year that isn't a leap year, so it becomes Feb 28.
function yearsEarlier(date, years) {
  const year = Number(date.slice(0, 4)) - years
  let monthDay = date.slice(4)
  if (monthDay === "-02-29") {
    monthDay = "-02-28"
  }
  return `${year}${monthDay}`
}

// presetRange returns the start and end dates of a preset, by its id. Every
// preset ends today; an unknown id is all time.
export function presetRange(id, today) {
  const preset = PRESETS.find(p => p.id === id)
  if (!preset || preset.years === 0) {
    return { start: ALL_TIME_START, end: today }
  }
  return { start: yearsEarlier(today, preset.years), end: today }
}

// rangePreset returns the id of the preset a range matches, or null when it's
// a custom range.
export function rangePreset(start, end, today) {
  for (const preset of PRESETS) {
    const range = presetRange(preset.id, today)
    if (range.start === start && range.end === end) {
      return preset.id
    }
  }
  return null
}

// rangeLabel is the text the date range menu's button shows: the preset's name,
// or the two dates of a custom range.
export function rangeLabel(start, end, today) {
  const id = rangePreset(start, end, today)
  const preset = PRESETS.find(p => p.id === id)
  if (preset) {
    return preset.label
  }
  return `${start} – ${end}`
}

