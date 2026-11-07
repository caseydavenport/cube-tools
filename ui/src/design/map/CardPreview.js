// The card preview the maps show over a hovered or selected card.

import React from "react"
import { CardImageURL } from "../../utils/Utils.js"

// CardPreview overlays the hovered/selected card's actual image (or its rules text
// if no image is available), pinned to the bottom-right of the viewport. With
// inline set, it fills its parent instead, for a map's hover preview.
export function CardPreview({ card, inline }) {
  if (!card) return null
  let className = "dm-preview"
  if (inline) {
    className = "dm-preview-inline"
  }
  return (
    <div className={className}>
      {(card.image || card.url) ? (
        <img className="kit-card-image dm-preview-img" src={CardImageURL(card)} alt={card.name} />
      ) : (
        <div className="kit-pop dm-preview-text">
          <div className="dm-preview-name">{card.name} <span className="dm-preview-mana">{card.mana_cost}</span></div>
          <div className="dm-preview-type">{[...(card.types || []), ...(card.sub_types || [])].join(" ")}</div>
          <div className="dm-preview-oracle">{card.oracle_text}</div>
        </div>
      )}
    </div>
  )
}
