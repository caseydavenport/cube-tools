// Helpers that let Mantine inputs stand in for the app's older controls, which
// hand their callers browser change events. Kept free of React so node tests
// can load it.

// asEvent wraps a plain value in the shape of a change event, so a Mantine
// control that reports a value can feed a caller that reads e.target.value.
// extra adds fields such as an id to both target and currentTarget.
export function asEvent(value, extra = {}) {
  return {
    target: { value, ...extra },
    currentTarget: { value, ...extra },
  }
}

// optionKey is the React key for the index-th option in a list. Labels and
// values can repeat (bucket names do), so the position is part of the key.
export function optionKey(option, index) {
  return `${option.value}-${index}`
}

// toSelectData turns { label, value } options into the shape Mantine's select
// inputs want, with every value as a string.
export function toSelectData(options) {
  return options.map(option => ({ value: String(option.value), label: option.label }))
}
