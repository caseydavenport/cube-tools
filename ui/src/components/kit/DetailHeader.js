// The header band every detail page opens with: an image, a title with a line
// under it, small tags, and a row of stat tiles. The card page uses it first;
// the package and archetype pages will too.

import React from "react"
import { Text } from "@mantine/core"
import "./kit.css"

// DetailHeader lays out a detail page's header. image is an image URL, or
// nothing for a page without one. tags are short strings shown as small
// badges; tiles are StatTile elements; children go under the tiles.
export function DetailHeader({ image, imageAlt, title, subtitle, actions, tags, tiles, children }) {
  return (
    <section className="kit-card kit-detail-header">
      {image && <img className="kit-card-image kit-detail-image" src={image} alt={imageAlt || title} />}

      <div className="kit-detail-body">
        <div className="kit-detail-title-row">
          <Text component="h2" className="kit-detail-title">{title}</Text>
          {(tags || []).map(tag => <span key={tag} className="kit-detail-tag">{tag}</span>)}
          {actions && <span className="kit-detail-actions">{actions}</span>}
        </div>
        {subtitle && <Text className="kit-detail-subtitle">{subtitle}</Text>}

        {tiles && <div className="kit-detail-tiles">{tiles}</div>}
        {children}
      </div>
    </section>
  )
}
