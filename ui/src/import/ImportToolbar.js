import React from "react"
import { Link } from "react-router-dom"
import { useCube } from "../contexts/CubeContext.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"

// ImportToolbar is the top bar of every import page. Its title is a breadcrumb:
// links back up through trail, then the current page's title. trail is a list
// of {label, path}, where path is relative to the cube's /import page ("" is
// the hub itself). actions sit on the right.
export function ImportToolbar({ trail = [], title, actions }) {
  const cube = useCube()

  // crumbLink is the address of one breadcrumb.
  function crumbLink(path) {
    if (path) {
      return `/${cube}/import/${path}`
    }
    return `/${cube}/import`
  }

  const heading = (
    <>
      {trail.map((crumb) => (
        <React.Fragment key={crumb.path}>
          <Link className="import-crumb" to={crumbLink(crumb.path)}>{crumb.label}</Link>
          <span className="import-crumb-sep">/</span>
        </React.Fragment>
      ))}
      {title}
    </>
  )

  return <PageToolbar title={heading} actions={actions} />
}

// HUB_CRUMB is the first breadcrumb on every page below the hub.
export const HUB_CRUMB = { label: "Import", path: "" }
