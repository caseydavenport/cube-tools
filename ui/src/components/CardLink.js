// A card name that links to the card's own page. Every place that shows a
// card name uses it, so a click anywhere lands on the same page.

import React from "react"
import { Link } from "react-router-dom"
import { cardPageHref } from "../shell/paths.js"

// CardLink links name to its card page in cube. children replace the visible
// text when given, for rows that show more than the name. It never touches
// the app's deck filter.
export function CardLink({ cube, name, className, children }) {
  let text = children
  if (text === undefined || text === null) {
    text = name
  }
  return (
    <Link to={cardPageHref(cube, name)} className={className}>
      {text}
    </Link>
  )
}
