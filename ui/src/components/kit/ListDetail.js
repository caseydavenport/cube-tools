import React from "react"
import { Link } from "react-router-dom"
import { Text } from "@mantine/core"
import "./kit.css"

// ListDetail lays out a browse page: a slim list on the left and the selected
// item's details on the right, each scrolling on its own below the page toolbar.
// On narrow screens the list stacks above the details.
export function ListDetail({ list, detail }) {
  return (
    <div className="kit-list-detail">
      <nav className="kit-list-pane">{list}</nav>
      <div className="kit-detail-pane">{detail}</div>
    </div>
  )
}

// ListGroupHeader is the small uppercase row that separates groups in a list,
// like the draft each group of decks came from.
export function ListGroupHeader({ children }) {
  return <Text className="kit-list-group">{children}</Text>
}

// ListRow is one slim row in a browse list: the main text on the left and a
// muted detail on the right. With href set it's a real link, so it can be opened
// in a new tab; onClick still runs first, for Ctrl+click to compare and the like.
export function ListRow({ selected, onClick, primary, secondary, href }) {
  // data-selected is only present on the selected row, so the CSS can style it
  // with an attribute selector, the way the sidebar marks the active page.
  let selectedAttr
  if (selected) {
    selectedAttr = ""
  }

  const body = (
    <>
      <span className="kit-list-primary">{primary}</span>
      <span className="kit-list-secondary">{secondary}</span>
    </>
  )

  if (href) {
    return (
      <Link to={href} onClick={onClick} className="kit-list-row" data-selected={selectedAttr}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className="kit-list-row" data-selected={selectedAttr}>
      {body}
    </button>
  )
}
