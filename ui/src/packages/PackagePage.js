// A package's own page: its wires, how its groups spread over the colors, how
// often it's built over time, and the decks that built it. The server computes
// everything (/stats/package).

import React, { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useCube } from "../contexts/CubeContext.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { packageUrl } from "../stats/pageRequests.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { BuiltOverTime } from "./BuiltOverTime.js"
import { PackageHeader } from "./PackageHeader.js"
import { ColorSupport, DecksBuilt, RelatedPackages } from "./PackageSections.js"
import { PackageMap } from "./PackageMap.js"
import { GroupPanel } from "./GroupPanel.js"
import { WirePanel } from "./WirePanel.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { ruleColor } from "../design/map/ruleColors.js"
import "../pages/pages.css"
import "../cards/cardPage.css"
import "./packagePage.css"

// RANGE_COPY is the date range menu's text.
const RANGE_COPY = {
  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",
}

// usePackagePage loads the package page's data for name over the date range.
// It returns { page, missing }: page is null while loading, and missing is
// true when the rules have no such package.
function usePackagePage(cube, name, start, end) {
  const [state, setState] = useState({ page: null, missing: false })

  useEffect(() => {
    setState({ page: null, missing: false })
    let cancelled = false
    fetch(packageUrl(cube, { name, start, end }))
      .then(r => {
        if (r.status === 404) {
          return { missing: true }
        }
        return r.json()
      })
      .then(body => {
        if (cancelled) {
          return
        }
        if (body.missing) {
          setState({ page: null, missing: true })
        } else {
          setState({ page: body, missing: false })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ page: null, missing: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [cube, name, start, end])

  return state
}

// useRulesGraph loads the cube's rules from /stats/design-graph, sorted the
// way every page colors them. It returns { groups, packages }, both empty
// until loaded, and loads again when refresh changes.
function useRulesGraph(cube, refresh) {
  const [rules, setRules] = useState({ groups: [], packages: [] })
  useEffect(() => {
    let cancelled = false
    fetch(`/api/${cube}/stats/design-graph`)
      .then(r => r.json())
      .then(body => {
        if (!cancelled) {
          setRules({ groups: body.groups || [], packages: body.packages || [] })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [cube, refresh])
  return rules
}

// indexByName maps each item's name to its position, for rule colors.
function indexByName(items) {
  const out = {}
  items.forEach((item, i) => {
    out[item.name] = i
  })
  return out
}

// PackagePage is the page for the package named in the URL. It follows the
// app's date range but not its deck filter; links out set the filter through
// onLinkMatch as they're followed.
export function PackagePage(props) {
  const { name } = useParams()
  const cube = useCube()
  const info = useCubeInfo(cube)
  const start = props.startDate || ""
  const end = props.endDate || ""
  const { page, missing } = usePackagePage(cube, name, start, end)
  const nav = { cube, start, end, onMatch: props.onLinkMatch }
  const rules = useRulesGraph(cube, 0)
  const groupIndex = indexByName(rules.groups)
  const groupsByName = {}
  for (const group of rules.groups) {
    groupsByName[group.name] = group
  }
  // Only one side panel is open at a time: a group's name or a wire's index.
  const [openGroup, setOpenGroup] = useState(null)
  const [openWire, setOpenWire] = useState(null)
  const packageIndex = indexByName(rules.packages)
  let packageColor = "var(--mantine-primary-color-filled)"
  if (page && packageIndex[page.name] !== undefined) {
    packageColor = ruleColor(packageIndex[page.name])
  }

  const toolbar = (
    <PageToolbar title={name}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={RANGE_COPY} />
    </PageToolbar>
  )

  let body = <div className="browse-empty">Loading {name}…</div>
  if (missing) {
    body = <div className="browse-empty">No package named {name}.</div>
  } else if (page) {
    body = (
      <>
        <PackageHeader page={page} info={info} />
        <div className="package-page-grid">
          <div className="card-page-wide">
            <SectionCard title="Map">
              <PackageMap
                map={page.map} groupIndex={groupIndex} packageColor={packageColor} canDrag={false}
                onOpenGroup={groupName => { setOpenWire(null); setOpenGroup(groupName) }}
                onOpenWire={index => { setOpenGroup(null); setOpenWire(index) }}
                onDropWire={() => {}}
              />
            </SectionCard>
          </div>
          <div className="card-page-wide">
            <ColorSupport page={page} />
          </div>
          <BuiltOverTime overTime={page.over_time} />
          <div className="card-page-stack">
            <RelatedPackages page={page} cube={cube} />
            <DecksBuilt page={page} nav={nav} />
          </div>
        </div>
        {openGroup !== null && (
          <GroupPanel
            name={openGroup} packageName={page.name} groupsByName={groupsByName} groupIndex={groupIndex}
            canEdit={false} range={{ start, end }} refresh={0} onClose={() => setOpenGroup(null)}
            onEdit={() => {}} onExclude={() => {}} onRestore={() => {}}
          />
        )}
        {openWire !== null && page.map.wires[openWire] && (
          <WirePanel
            wire={page.map.wires[openWire]} index={openWire} color={packageColor} canEdit={false}
            onClose={() => setOpenWire(null)} onEdit={() => {}} onRemove={() => {}}
          />
        )}
      </>
    )
  }

  return (
    <>
      {toolbar}
      <div className="card-page">{body}</div>
    </>
  )
}
