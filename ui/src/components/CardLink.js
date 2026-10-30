// A card name that links to the card's own page. Every place that shows a
// card name uses it, so a click anywhere lands on the same page.

import React from "react"
import { Link } from "react-router-dom"
import { cardPageHref } from "../shell/paths.js"

// CardLink links name to its card page in cube. children replace the visible
// text when given, for rows that show more than the name. onClick runs on a
// click, for rows whose own click also navigates. It never touches the app's
// deck filter.
export function CardLink({ cube, name, className, onClick, children }) {
  let text = children
  if (text === undefined || text === null) {
    text = name
  }
  return (
    <Link to={cardPageHref(cube, name)} className={className} onClick={onClick}>
      {text}
    </Link>
  )
}

// CardPageIcon is a small icon link to a card's page, for rows whose own
// click does something else, such as focusing the card on a map. className
// gives it the row's icon-link look.
export function CardPageIcon({ cube, name, className }) {
  return (
    <Link to={cardPageHref(cube, name)} className={className} title="Open card page" aria-label={`Open ${name}'s card page`}>
      ↗
    </Link>
  )
}
