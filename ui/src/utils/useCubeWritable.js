import { useEffect, useState } from 'react'

// Each cube's info is fetched once and shared by every component that asks.
// It can go stale after an import adds a cube's first decks, until reload.
const known = new Map()
const pending = new Map()
const UNKNOWN = Object.freeze({})

// fetchCubeInfo resolves to the server's description of a cube (writability and
// which kinds of data it has), or undefined if the request fails. Failures
// aren't cached, so the next caller asks again instead of seeing a writable cube
// as read-only until reload.
export function fetchCubeInfo(cube) {
  if (known.has(cube)) return Promise.resolve(known.get(cube))
  if (!pending.has(cube)) {
    pending.set(cube, fetch(`/api/${cube}/info`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`info ${r.status}`)))
      .then(d => { known.set(cube, d); return d })
      .catch(() => undefined)
      .finally(() => pending.delete(cube)))
  }
  return pending.get(cube)
}

// useCubeInfo returns the cube's info object, or an empty object until the
// server answers or if the request fails. Missing keys mean unknown.
export function useCubeInfo(cube) {
  const cached = cube => (cube && known.get(cube)) || UNKNOWN
  // The answer is stored with the cube it's for, so a component that switches
  // cubes never shows the previous cube's answer, even for one frame.
  const [state, setState] = useState(() => ({ cube, info: cached(cube) }))
  useEffect(() => {
    if (!cube || known.has(cube)) return
    let alive = true
    fetchCubeInfo(cube).then(info => { if (alive) setState({ cube, info: info || UNKNOWN }) })
    return () => { alive = false }
  }, [cube])
  return state.cube === cube ? state.info : cached(cube)
}

// useCubeWritable reports whether the server lets this cube be edited: true,
// false, or undefined until the server answers or if the request fails. Callers
// that only hide write controls can treat undefined as read-only.
export function useCubeWritable(cube) {
  return useCubeInfo(cube).writable
}
