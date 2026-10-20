// The pieces of loading stats that don't need React: running one load and
// ignoring it once it's out of date, and remembering which cube a loaded
// value came from. Kept free of React so node tests can load it.

// startLoad runs load(), which returns a promise, and passes its result to
// onValue or its error to onFailure. It returns cancel(): after cancel runs,
// neither callback is called, so an out-of-date answer is dropped.
export function startLoad(load, onValue, onFailure) {
  let cancelled = false

  load().then(
    value => {
      if (!cancelled) {
        onValue(value)
      }
    },
    error => {
      if (!cancelled) {
        onFailure(error)
      }
    },
  )

  return function cancel() {
    cancelled = true
  }
}

// fromCallback turns one of Fetch.js's callback loaders into a promise.
// start(resolve) calls the loader with resolve as its callback and returns
// the loader's own promise, whose rejection (a network or parse error) is
// passed on.
export function fromCallback(start) {
  return new Promise((resolve, reject) => {
    start(resolve).catch(reject)
  })
}

// loadedState records a value that loaded for a cube.
export function loadedState(cube, value) {
  return { cube, value, failed: false }
}

// failedState records that a load for a cube failed. It keeps the last value
// only if that value was for the same cube, so the page can keep showing it.
export function failedState(previous, cube) {
  let value = undefined
  if (previous.cube === cube) {
    value = previous.value
  }
  return { cube, value, failed: true }
}

// shownState is what a page sees: the stored value when it's for this cube,
// otherwise initialValue with nothing loaded and nothing failed yet.
export function shownState(state, cube, initialValue) {
  if (state.cube !== cube) {
    return { value: initialValue, loaded: false, failed: false }
  }

  let value = state.value
  if (value === undefined) {
    value = initialValue
  }
  return { value, loaded: !state.failed, failed: state.failed }
}
