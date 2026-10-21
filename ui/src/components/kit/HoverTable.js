// HoverTable is a compact table for inside a popover, passed as HoverInfo's
// info, such as who played a card and how often.

import React from "react"

// ALIGN_CLASSES maps a column's align to the class that aligns its cells.
// Left is the default and needs no class.
const ALIGN_CLASSES = {
  right: "kit-pop-right",
  center: "kit-pop-center",
}

// HoverTable draws a header row from columns ({ key, label, align }) and one
// row per object in rows, reading each cell by its column's key.
export function HoverTable({ columns, rows }) {
  return (
    <table className="kit-pop-table">
      <thead>
        <tr>
          {columns.map(col => <th key={col.key} className={ALIGN_CLASSES[col.align]}>{col.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map(col => <td key={col.key} className={ALIGN_CLASSES[col.align]}>{row[col.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
