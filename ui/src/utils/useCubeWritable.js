import { useEffect, useState } from 'react'

// Writability doesn't change while the app runs, so each cube's answer is
// fetched once and shared by every component that asks.
const known = new Map()
const pending = new Map()

function fetchWritable(cube) {
  if (!pending.has(cube)) {
    pending.set(cube, fetch(`/api/${cube}/info`)
      .then(r => r.ok ? r.json() : { writable: false })
      .then(d => { known.set(cube, !!d.writable); return known.get(cube) })
      .catch(() => false))
  }
  return pending.get(cube)
}

// useCubeWritable reports whether the server lets this cube be edited. It's
// false until the server answers, and if the request fails, so write controls
// never flash on a read-only cube.
export function useCubeWritable(cube) {
  const [writable, setWritable] = useState(() => !!cube && known.get(cube) === true)
  useEffect(() => {
    if (!cube) { setWritable(false); return }
    if (known.has(cube)) { setWritable(known.get(cube)); return }
    let alive = true
    fetchWritable(cube).then(w => { if (alive) setWritable(w) })
    return () => { alive = false }
  }, [cube])
  return writable
}
