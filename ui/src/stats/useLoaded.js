// useLoaded is the React hook behind each piece of stats data: it loads when
// the page needs it, reloads when the cube or its inputs change, and never
// shows a value that belongs to another cube.

import { useEffect, useState } from "react"
import { failedState, loadedState, shownState, startLoad } from "./loading.js"

// useLoaded runs load() when needed is true, and again whenever cube, needed,
// or any entry of deps changes. load returns a promise of the value. It
// returns { value, loaded, failed }: value is initialValue until this cube's
// answer arrives. When needed is false nothing loads, and a value loaded
// earlier stays available.
export function useLoaded(cube, needed, load, deps, initialValue) {
  const [state, setState] = useState({ cube: null, value: undefined, failed: false })

  useEffect(() => {
    if (!needed) {
      return
    }

    function onValue(value) {
      setState(loadedState(cube, value))
    }
    function onFailure() {
      setState(previous => failedState(previous, cube))
    }

    // Returning cancel makes React call it before the next load and when the
    // page goes away, so an answer that's out of date is dropped.
    return startLoad(load, onValue, onFailure)

    // The list is spread so each caller's own inputs (dates, filters) count as
    // dependencies, alongside the cube and whether the page needs this data.
  }, [cube, needed, ...deps])

  return shownState(state, cube, initialValue)
}
