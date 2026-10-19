import React from "react"
import { Link } from "react-router-dom"
import { Anchor, Text } from "@mantine/core"
import "./kit.css"

// SectionCard is a titled card for one block of a page. The small uppercase
// title sits top left; when linkLabel and href are set, a link to the block's
// full page sits top right.
export function SectionCard({ title, linkLabel, href, children }) {
  return (
    <section className="kit-card kit-section">
      <div className="kit-section-header">
        <Text className="kit-section-title">{title}</Text>
        {linkLabel && href && (
          <Anchor component={Link} to={href} className="kit-section-link">
            {linkLabel}
          </Anchor>
        )}
      </div>

      {children}
    </section>
  )
}
