// A package's own page: its wires, how its groups spread over the colors, how
// often it's built over time, and the decks that built it.

import React from "react"
import { useParams } from "react-router-dom"
import { PageToolbar } from "../toolbar/PageToolbar.js"

// PackagePage is the page for the package named in the URL.
export function PackagePage() {
  const { name } = useParams()
  return <PageToolbar title={name} />
}
