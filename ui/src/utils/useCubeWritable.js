import { useEffect, useState } from 'react'

// Each cube's info is fetched once and shared by every component that asks.
// It can go stale after an import adds a cube's first decks, until reload.
const known = new Map()
const pending = new Map()

// UNKNOWN is the info used before the server answers: one shared empty object,
// so effects that depend on the info don't re-run on every render.
const UNKNOWN = Object.freeze({})

// fetchCubeInfo resolves to the server's description of a cube (writability and
// which kinds of data it has), or undefined if the request fails. Failures
// aren't cached, so the next caller asks again instead of seeing a writable cube
// as read-only until reload.
export function fetchCubeInfo(cube) {
  if (known.has(cube)) {
    return Promise.resolve(known.get(cube))
  }

  // Callers that ask while a request is in flight share that request.
  if (!pending.has(cube)) {
    const request = fetch(`/api/${cube}/info`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`info ${r.status}`)))
      .then(info => {
        known.set(cube, info)
        return info
      })
      .catch(() => undefined)
      .finally(() => pending.delete(cube))
    pending.set(cube, request)
  }
  return pending.get(cube)
}

// cachedInfo returns the info already fetched for a cube, or UNKNOWN if there is
// none yet.
function cachedInfo(cube) {
  if (cube && known.has(cube)) {
    return known.get(cube)
  }
  return UNKNOWN
}

// useCubeInfo returns the cube's info object, or an empty object until the
// server answers or if the request fails. Missing keys mean unknown.
export function useCubeInfo(cube) {
  // The answer is stored with the cube it's for. When the cube changes, the
  // stored answer belongs to the old cube and is ignored below, so a component
  // never shows the previous cube's info, even for one frame.
  const [state, setState] = useState(() => ({ cube, info: cachedInfo(cube) }))

  useEffect(() => {
    if (!cube || known.has(cube)) {
      return
    }

    // If the cube changes before the request finishes, the cleanup below marks
    // this request stale so its answer isn't stored.
    let stale = false
    fetchCubeInfo(cube).then(info => {
      if (!stale) {
        setState({ cube, info: info || UNKNOWN })
      }
    })
    return () => {
      stale = true
    }
  }, [cube])

  if (state.cube === cube) {
    return state.info
  }
  return cachedInfo(cube)
}

// useCubeWritable reports whether the server lets this cube be edited: true,
// false, or undefined until the server answers or if the request fails. Callers
// that only hide write controls can treat undefined as read-only.
export function useCubeWritable(cube) {
  return useCubeInfo(cube).writable
}
