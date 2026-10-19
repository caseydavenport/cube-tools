import React from "react"
import { Link } from "react-router-dom"
import { Text, UnstyledButton } from "@mantine/core"
import "./kit.css"

// StatTile is a small card for one headline number: a label on top, a large
// value, an optional colored accent after the value (like "54%"), and a short
// detail line underneath. With href set, the whole tile links to that page.
export function StatTile({ label, value, accent, detail, href }) {
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
  return <div className="kit-card kit-tile">{body}</div>
}
