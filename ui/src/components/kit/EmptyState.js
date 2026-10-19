import React from "react"
import { Text } from "@mantine/core"
import "./kit.css"

// EmptyState is a muted, centered line shown in place of a block's content when
// it has nothing to show, such as "needs decks" or a failed request.
export function EmptyState({ children }) {
  return <Text className="kit-empty">{children}</Text>
}
