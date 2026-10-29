import React from "react"
import { Link } from "react-router-dom"
import { Text, UnstyledButton } from "@mantine/core"
import { HoverInfo } from "./HoverInfo.js"
import "./kit.css"

// StatTile is a small card for one headline number: a label on top, a large
// value, an optional colored accent after the value (like "54%"), and a short
// detail line underneath. With href set, the whole tile links to that page.
// tip, when set, explains the number in a popover when the tile is hovered.
export function StatTile({ label, value, accent, detail, href, tip }) {
  const body = (
    <>
      <Text className="kit-tile-label">{label}</Text>

      <div className="kit-tile-value-row">
        <span className="kit-tile-value">{value}</span>
        {accent && <span className="kit-tile-accent">{accent}</span>}
      </div>

      {detail && <Text className="kit-tile-detail">{detail}</Text>}
    </>
  )

  if (href) {
    return (
      <UnstyledButton component={Link} to={href} className="kit-card kit-tile kit-tile-link">
        {body}
      </UnstyledButton>
    )
  }
  const tile = <div className="kit-card kit-tile">{body}</div>
  if (tip) {
    return <HoverInfo title={label} info={tip}>{tile}</HoverInfo>
  }
  return tile
}
