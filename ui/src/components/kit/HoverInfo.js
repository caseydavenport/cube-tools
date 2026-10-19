import React from "react"
import { HoverCard, Text } from "@mantine/core"

// HoverInfo shows a small card of extra detail (info, under an optional title)
// while the pointer rests on its child, such as what a column header means or
// the numbers behind a table cell. The child is used as is, so a table cell
// can be the target without breaking the table. width fixes the card's width.
export function HoverInfo({ title, info, width, position = "top", children }) {
  // Mantine gives the target the card's id, so pass the child's own id through.
  // Sortable headers and clickable cells read it back on click.
  let id = undefined
  if (children && children.props && children.props.id) {
    id = String(children.props.id)
  }

  return (
    <HoverCard id={id} openDelay={200} closeDelay={100} shadow="md" width={width} position={position} withinPortal>
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown className="kit-hover-info">
        <HoverInfoTitle title={title} />
        {info}
      </HoverCard.Dropdown>
    </HoverCard>
  )
}

// HoverInfoTitle is the bold first line of a hover card, when it has one.
function HoverInfoTitle({ title }) {
  if (title == null || title === "") {
    return null
  }
  return <Text fw={600} size="sm" mb={4}>{title}</Text>
}
