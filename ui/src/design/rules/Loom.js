// Loom draws two columns of group chips joined by threads, for a link's wiring.

import React, { useState, useRef, useLayoutEffect } from 'react'
import { UnstyledButton } from '@mantine/core'

// Loom draws group chips in two columns with SVG threads connecting them - the
// wiring-diagram view of a link. Thread endpoints are measured from the rendered
// chips, so it survives wrapping and resizes.
export function Loom({ left, right, threads }) {
  const wrapRef = useRef(null)
  const chipRefs = useRef({})
  const [paths, setPaths] = useState([])
  const depKey = left.map(c => c.key).join('|') + '::' + right.map(c => c.key).join('|') + '::' + threads.map(t => t.key + t.color).join('|')

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const compute = () => {
      const wr = wrap.getBoundingClientRect()
      const out = []
      for (const t of threads) {
        const a = chipRefs.current['L:' + t.from]
        const b = chipRefs.current['R:' + t.to]
        if (!a || !b) continue
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect()
        const x1 = ar.right - wr.left, y1 = ar.top + ar.height / 2 - wr.top
        const x2 = br.left - wr.left, y2 = br.top + br.height / 2 - wr.top
        const mx = (x1 + x2) / 2
        out.push({ key: t.key, color: t.color, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` })
      }
      setPaths(out)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [depKey])

  const chipEl = (side) => (c) => {
    let Tag = 'span'
    if (c.onClick) {
      Tag = UnstyledButton
    }
    return (
      <Tag
        key={c.key} className="de-loom-chip" onClick={c.onClick}
        ref={el => { if (el) chipRefs.current[side + ':' + c.key] = el; else delete chipRefs.current[side + ':' + c.key] }}
      >
        <span className="dm-swatch" style={{ background: c.color }} />
        <span className="de-loom-chip-name">{c.label}</span>
        {c.sub && <span className="de-loom-chip-sub">{c.sub}</span>}
      </Tag>
    )
  }

  return (
    <div className="de-loom" ref={wrapRef}>
      <div className="de-loom-col">{left.map(chipEl('L'))}</div>
      <div className="de-loom-col de-loom-col-right">{right.map(chipEl('R'))}</div>
      <svg className="de-loom-svg" aria-hidden="true">
        {paths.map(p => <path key={p.key} d={p.d} stroke={p.color} className="de-thread" />)}
      </svg>
    </div>
  )
}
