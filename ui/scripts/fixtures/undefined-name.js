// Uses a component and a function that are never defined or imported.
import React from "react"

export function Broken() {
  notDefined()
  return <Missing />
}
