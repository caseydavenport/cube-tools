// useLoaded is the React hook behind each piece of stats data: it loads when
// the page needs it, reloads when the cube or its inputs change, and never
// shows a value loaded for another cube or other inputs.

import { useEffect, useState } from "react"
import { failedState, loadKey, loadedState, shownState, startLoad } from "./loading.js"

// useLoaded runs load() when needed is true, and again whenever cube, needed,
// or any entry of deps changes. load returns a promise of the value. It
// returns { value, loaded, failed }: value is initialValue until the answer
// for this cube and these deps arrives. When needed is false nothing loads,
// and a value loaded earlier stays available while its inputs are unchanged.
export function useLoaded(cube, needed, load, deps, initialValue) {
  const [state, setState] = useState({ key: null, value: undefined, failed: false })
  const key = loadKey(cube, deps)

  useEffect(() => {
    if (!needed) {
      return
    }

    function onValue(value) {
      setState(loadedState(key, value))
    }
    function onFailure() {
      setState(previous => failedState(previous, key))
    }

    // Returning cancel makes React call it before the next load and when the
    // page goes away, so an answer that's out of date is dropped.
    return startLoad(load, onValue, onFailure)

    // The list is spread so each caller's own inputs (dates, filters) count as
    // dependencies, alongside the cube and whether the page needs this data.
  }, [cube, needed, ...deps])

  return shownState(state, key, initialValue)
}
