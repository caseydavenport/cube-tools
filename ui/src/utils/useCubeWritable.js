import { useEffect, useState } from 'react'

// Writability doesn't change while the app runs, so each cube's answer is
// fetched once and shared by every component that asks.
const known = new Map()
const pending = new Map()

// fetchWritable resolves to the server's answer for a cube, or undefined if
// the request fails. Failures aren't cached, so the next caller asks again
// instead of seeing a writable cube as read-only until reload.
export function fetchWritable(cube) {
  if (known.has(cube)) return Promise.resolve(known.get(cube))
  if (!pending.has(cube)) {
    pending.set(cube, fetch(`/api/${cube}/info`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`info ${r.status}`)))
      .then(d => { known.set(cube, !!d.writable); return known.get(cube) })
      .catch(() => undefined)
      .finally(() => pending.delete(cube)))
  }
  return pending.get(cube)
}

// useCubeWritable reports whether the server lets this cube be edited: true,
// false, or undefined until the server answers or if the request fails. Callers
// that only hide write controls can treat undefined as read-only.
export function useCubeWritable(cube) {
  const cached = cube => cube ? known.get(cube) : undefined
  // The answer is stored with the cube it's for, so a component that switches
  // cubes never shows the previous cube's answer, even for one frame.
  const [state, setState] = useState(() => ({ cube, writable: cached(cube) }))
  useEffect(() => {
    if (!cube || known.has(cube)) return
    let alive = true
    fetchWritable(cube).then(w => { if (alive) setState({ cube, writable: w }) })
    return () => { alive = false }
  }, [cube])
  return state.cube === cube ? state.writable : cached(cube)
}
