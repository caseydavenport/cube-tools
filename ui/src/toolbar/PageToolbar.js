import React from "react"
import { Text } from "@mantine/core"
import "./toolbar.css"

// PageToolbar is the bar across the top of a browse page. The page title sits on
// the left, then the page's filters (children), then its action buttons pushed
// to the right. It stays stuck to the top of the window while the page scrolls.
export function PageToolbar({ title, children, actions }) {
  return (
    <div className="se-toolbar">
      <Text component="h1" className="se-toolbar-title">{title}</Text>

      <div className="se-toolbar-filters">{children}</div>

      <div className="se-toolbar-actions">{actions}</div>
    </div>
  )
}
