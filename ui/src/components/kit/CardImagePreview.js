// CardImagePreview shows a larger copy of a card's image while the pointer
// rests on its child, such as a small card image in a deck or a draft pack.

import React from "react"
import { HoverCard } from "@mantine/core"
import { HOVER_PROPS, useEscapeToClose } from "./HoverInfo.js"

// CardImagePreview pops up the image at src, width px wide, with no frame or
// arrow: the image carries the card corners and shadow (kit-card-image). Other
// props, such as sort, are ignored here; SortFunc reads sort off this element
// to order a list of them.
export function CardImagePreview({ src, alt, width, position = "top", children }) {
  const escape = useEscapeToClose()

  return (
    <HoverCard {...HOVER_PROPS} {...escape} position={position} classNames={{ dropdown: "kit-card-pop" }}>
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown>
        <img className="kit-card-image" src={src} alt={alt} width={width} />
      </HoverCard.Dropdown>
    </HoverCard>
  )
}
