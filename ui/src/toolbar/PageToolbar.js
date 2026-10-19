import React, { useEffect, useRef } from "react"
import { Text } from "@mantine/core"
import "./toolbar.css"

// PageToolbar is the bar across the top of a browse page. The page title sits on
// the left, then the page's filters (children), then its action buttons pushed
// to the right. It stays stuck to the top of the window while the page scrolls.
export function PageToolbar({ title, children, actions }) {
  const ref = useRef(null)
  usePublishedHeight(ref)

  return (
    <div className="se-toolbar" ref={ref}>
      <Text component="h1" className="se-toolbar-title">{title}</Text>

      <div className="se-toolbar-filters">{children}</div>

      <div className="se-toolbar-actions">{actions}</div>
    </div>
  )
}

// usePublishedHeight keeps the --toolbar-height CSS variable equal to the
// toolbar's real height, which grows when its controls wrap onto a second row.
// Layouts below it (the list-and-detail columns, sticky section navs) use the
// variable to sit just under the toolbar.
function usePublishedHeight(ref) {
  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const root = document.documentElement
    function publish() {
      root.style.setProperty("--toolbar-height", `${element.offsetHeight}px`)
    }

    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)

    // When the page goes away, drop the measured value so the CSS default
    // applies again until the next toolbar measures itself.
    return () => {
      observer.disconnect()
      root.style.removeProperty("--toolbar-height")
    }
  }, [ref])
}
