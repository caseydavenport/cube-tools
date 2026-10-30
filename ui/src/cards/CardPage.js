// A card's own page: how it relates to the cube, how it's played, and what
// it interacts with. The server computes everything (/stats/card).

import React from "react"
import { useParams } from "react-router-dom"
import { PageToolbar } from "../toolbar/PageToolbar.js"

// CardPage is the page for the card named in the URL.
export function CardPage() {
  const { name } = useParams()
  return <PageToolbar title={name} />
}
