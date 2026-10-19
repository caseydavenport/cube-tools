import React from "react"
import { Link } from "react-router-dom"
import { Anchor, Text } from "@mantine/core"
import "./kit.css"

// SectionCard is a titled card for one block of a page. The small uppercase
// title sits top left; when linkLabel and href are set, a link to the block's
// full page sits top right. action is any other control for the top right,
// such as an edit button.
export function SectionCard({ title, linkLabel, href, action, children }) {
  return (
    <section className="kit-card kit-section">
      <div className="kit-section-header">
        <Text className="kit-section-title">{title}</Text>
        {linkLabel && href && (
          <Anchor component={Link} to={href} className="kit-section-link">
            {linkLabel}
          </Anchor>
        )}
        {action}
      </div>

      {children}
    </section>
  )
}
