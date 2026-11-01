// A package's own page: its map of groups and wires, how its groups spread
// over the colors, how often it's built over time, and the decks that built
// it. The server computes everything (/stats/package). On a writable cube the
// groups and wires can be edited here.

import React, { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button, Group } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { packageUrl } from "../stats/pageRequests.js"
import { useCubeInfo, useCubeWritable } from "../utils/useCubeWritable.js"
import { pageHref, packagePageHref } from "../shell/paths.js"
import { BuiltOverTime } from "./BuiltOverTime.js"
import { PackageHeader } from "./PackageHeader.js"
import { ColorSupport, DecksBuilt, RelatedPackages } from "./PackageSections.js"
import { PackageMap } from "./PackageMap.js"
import { GroupPanel } from "./GroupPanel.js"
import { WirePanel } from "./WirePanel.js"
import { ConfirmEdit } from "./ConfirmEdit.js"
import { GroupEditModal } from "../design/map/GroupEditModal.js"
import { PackageEditModal } from "../design/map/PackageEditModal.js"
import { saveDesignMap } from "../design/map/designData.js"
import { cleanWires } from "../utils/DesignRules.js"
import { cleanGroup, withCardExcluded, withGroup, withWireAdded, withWireRemoved } from "../design/rules/rulebookEdits.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { ruleColor } from "../design/map/ruleColors.js"
import "../design/rules/rules.css"
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

// usePackagePage loads the package page's data for name over the date range,
// again whenever refresh changes. It returns { page, missing }: page is null
// while loading, and missing is true when the rules have no such package.
function usePackagePage(cube, name, start, end, refresh) {
  const [state, setState] = useState({ page: null, missing: false })

  // A refresh after a save keeps the old page up until the new one arrives,
  // so the map doesn't blink.
  useEffect(() => {
    setState({ page: null, missing: false })
  }, [cube, name, start, end])

  useEffect(() => {
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
  }, [cube, name, start, end, refresh])

  return state
}

// useRulesGraph loads the cube's rules from /stats/design-graph, sorted the
// way every page colors them. Like useState, it returns the rules
// ({ groups, packages }, both empty until loaded) and their setter, and it
// loads again when refresh changes.
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
  return [rules, setRules]
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
  const navigate = useNavigate()
  const info = useCubeInfo(cube)
  const canEdit = useCubeWritable(cube) === true
  const start = props.startDate || ""
  const end = props.endDate || ""
  const range = { start, end }
  const [refresh, setRefresh] = useState(0)
  const { page, missing } = usePackagePage(cube, name, start, end, refresh)
  const nav = { cube, start, end, onMatch: props.onLinkMatch }
  const [rules, setRules] = useRulesGraph(cube, refresh)
  const groupIndex = indexByName(rules.groups)
  const packageIndex = indexByName(rules.packages)
  const groupsByName = {}
  for (const group of rules.groups) {
    groupsByName[group.name] = group
  }
  let packageColor = "var(--mantine-primary-color-filled)"
  if (page && packageIndex[page.name] !== undefined) {
    packageColor = ruleColor(packageIndex[page.name])
  }
  const pkg = rules.packages.find(p => p.name === name) || null

  // Only one side panel is open at a time: a group's name or a wire's index.
  const [openGroup, setOpenGroup] = useState(null)
  const [openWire, setOpenWire] = useState(null)

  // The dialog that's open, if any: { kind: "group", group }, { kind:
  // "package", wire } for the package dialog opened on a wire, or
  // { kind: "confirm", ... } with ConfirmEdit's props and onSaved.
  const [dialog, setDialog] = useState(null)
  const [status, setStatus] = useState("")

  const refetch = () => setRefresh(r => r + 1)

  // save writes the whole rule set, then runs onSaved, or refetches when
  // onSaved isn't given.
  function save(next, onSaved) {
    saveDesignMap(cube, next.groups, next.packages, onSaved || refetch, setStatus)
    setDialog(null)
  }

  function saveGroup(updated) {
    const entry = cleanGroup(updated)
    if (!entry) {
      setStatus("A group needs at least one condition.")
      return
    }
    // A rename from the open panel keeps the panel on the group.
    if (openGroup === dialog.group.name) {
      setOpenGroup(entry.name)
    }
    save(withGroup(rules, dialog.group.name, entry))
  }

  // saveGroupByIndex saves a group edited from inside the package dialog.
  function saveGroupByIndex(index, updated) {
    const entry = cleanGroup(updated)
    if (!entry) {
      setStatus("A group needs at least one condition.")
      return
    }
    save(withGroup(rules, rules.groups[index].name, entry))
  }

  // savePackage saves the package dialog. A rename moves to the new name's
  // page once the save succeeds.
  function savePackage(updated) {
    const wires = cleanWires(updated.wires)
    if (!wires) {
      setStatus("Every wire needs a group on both sides.")
      return
    }
    // copy-ok: name saved to the rules file
    const newName = updated.name.trim() || "Untitled package"
    const packages = rules.packages.map(p => (p.name === pkg.name ? { name: newName, wires } : p))
    let onSaved = refetch
    if (newName !== pkg.name) {
      onSaved = () => {
        refetch()
        navigate(packagePageHref(cube, newName))
      }
    }
    save({ groups: rules.groups, packages }, onSaved)
  }

  // setCardExcluded adds a card to a group's excludes or takes it off. The
  // change shows before the save returns, so a quick second click builds on
  // this one.
  function setCardExcluded(groupName, card, excluded) {
    const groups = withCardExcluded(rules.groups, groupName, card, excluded)
    setRules({ groups, packages: rules.packages })
    save({ groups, packages: rules.packages })
  }

  function confirmWireAdded(a, b) {
    setDialog({
      kind: "confirm",
      title: "Add this wire?",
      proposed: withWireAdded(rules, pkg.name, a, b),
    })
  }

  function confirmWireRemoved(index) {
    setOpenWire(null)
    setDialog({
      kind: "confirm",
      title: `Remove wire ${index + 1}?`,
      proposed: withWireRemoved(rules, pkg.name, index),
    })
  }

  function confirmDelete() {
    setDialog({
      kind: "confirm",
      title: `Delete ${pkg.name}?`,
      message: `${pkg.name} leaves the rules. Its groups stay.`,
      confirmLabel: "Delete",
      proposed: { groups: rules.groups, packages: rules.packages.filter(p => p.name !== pkg.name) },
      onSaved: () => navigate(pageHref(cube, "packages")),
    })
  }

  // The package dialog opened on wire, appending an empty wire when wire is
  // past the last one.
  function packageDialogPkg(wire) {
    const wires = pkg.wires || []
    if (wire < wires.length) {
      return pkg
    }
    return { ...pkg, wires: [...wires, { kind: "enables", sources: [""], targets: [""] }] }
  }

  const toolbar = (
    <PageToolbar title={name}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={RANGE_COPY} />
    </PageToolbar>
  )

  let actions = null
  if (canEdit && pkg) {
    actions = (
      <Group gap="xs">
        <Button size="xs" variant="default" onClick={() => setDialog({ kind: "package", wire: (pkg.wires || []).length })}>+ Wire</Button>
        <Button size="xs" variant="default" onClick={() => setDialog({ kind: "package", wire: 0 })}>Edit</Button>
        <Button size="xs" color="red" variant="light" onClick={confirmDelete}>Delete</Button>
      </Group>
    )
  }

  let body = <div className="browse-empty">Loading {name}…</div>
  if (missing) {
    body = <div className="browse-empty">No package named {name}.</div>
  } else if (page) {
    body = (
      <>
        <PackageHeader page={page} info={info} actions={actions} />
        {status && <div className="de-status" role="status">{status}</div>}
        <div className="package-page-grid">
          <div className="card-page-wide">
            <SectionCard title="Map">
              <PackageMap
                map={page.map} groupIndex={groupIndex} packageColor={packageColor} canDrag={canEdit && pkg !== null}
                onOpenGroup={groupName => { setOpenWire(null); setOpenGroup(groupName) }}
                onOpenWire={index => { setOpenGroup(null); setOpenWire(index) }}
                onDropWire={confirmWireAdded}
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
            canEdit={canEdit} range={range} refresh={refresh} onClose={() => setOpenGroup(null)}
            onEdit={() => setDialog({ kind: "group", group: groupsByName[openGroup] })}
            onExclude={(groupName, card) => setCardExcluded(groupName, card, true)}
            onRestore={(groupName, card) => setCardExcluded(groupName, card, false)}
          />
        )}
        {openWire !== null && page.map.wires[openWire] && (
          <WirePanel
            wire={page.map.wires[openWire]} index={openWire} color={packageColor} canEdit={canEdit && pkg !== null}
            onClose={() => setOpenWire(null)}
            onEdit={() => { setOpenWire(null); setDialog({ kind: "package", wire: openWire }) }}
            onRemove={() => confirmWireRemoved(openWire)}
          />
        )}
      </>
    )
  }

  let dialogView = null
  if (dialog && dialog.kind === "group" && dialog.group) {
    dialogView = (
      <GroupEditModal
        group={dialog.group} color={ruleColor(groupIndex[dialog.group.name] || 0)} rules={rules} range={range}
        onSave={saveGroup} onCancel={() => setDialog(null)}
      />
    )
  } else if (dialog && dialog.kind === "package" && pkg) {
    dialogView = (
      <PackageEditModal
        pkg={packageDialogPkg(dialog.wire)} initialWire={dialog.wire} color={packageColor}
        groupNames={rules.groups.map(g => g.name)} groups={rules.groups} rules={rules} range={range}
        onSave={savePackage} onCancel={() => setDialog(null)} onGroupSaved={saveGroupByIndex}
      />
    )
  } else if (dialog && dialog.kind === "confirm") {
    dialogView = (
      <ConfirmEdit
        cube={cube} proposed={dialog.proposed} range={range} title={dialog.title}
        message={dialog.message} confirmLabel={dialog.confirmLabel}
        onSave={proposed => save(proposed, dialog.onSaved)} onCancel={() => setDialog(null)}
      />
    )
  }

  return (
    <>
      {toolbar}
      <div className="card-page">{body}</div>
      {dialogView}
    </>
  )
}
