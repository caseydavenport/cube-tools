import React, { Fragment } from "react"
import { Link } from "react-router-dom"
import { NavLink, ScrollArea, Text, Tooltip } from "@mantine/core"
import {
  IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconUpload,
} from "@tabler/icons-react"
import { NAV_GROUPS, pageAvailability } from "../nav/sections.js"
import { ICONS } from "./icons.js"
import { CubeSwitcher } from "./CubeSwitcher.js"
import { pageHref } from "./paths.js"
import { useColorSchemeToggle } from "./useColorSchemeToggle.js"

const ICON_SIZE = 18

// SidebarItem is one sidebar row: an icon, a label, and, for a dimmed page, the
// reason on the right. Collapsed, it shows only its icon and moves the label
// (and reason) into a tooltip. Any other props go to Mantine's NavLink, such as
// component and to for a link, or onClick for a button.
function SidebarItem({ label, reason, icon: Icon, collapsed, active, dimmed, ...linkProps }) {
  let className = "se-item"
  if (dimmed) {
    className += " se-dim"
  }

  let tooltip = label
  if (reason) {
    tooltip = `${label} (${reason})`
  }

  return (
    <Tooltip label={tooltip} position="right" disabled={!collapsed} withArrow>
      <NavLink
        {...linkProps}
        className={className}
        active={active}
        label={collapsed ? null : label}
        leftSection={<Icon size={ICON_SIZE} stroke={1.6} />}
        rightSection={!collapsed && reason ? <span className="se-reason">{reason}</span> : null}
        aria-label={collapsed ? label : undefined}
      />
    </Tooltip>
  )
}

// GroupHeading is a group's small uppercase title, or a thin line in the
// collapsed rail. The Home group has no heading.
function GroupHeading({ label, collapsed }) {
  if (!label) {
    return null
  }
  if (collapsed) {
    return <div className="se-group-line" />
  }
  return <Text className="se-group-label">{label}</Text>
}

// SidebarGroup renders one group from the nav model: its heading, then a link
// per page, dimmed with a reason when the cube lacks the data the page needs.
function SidebarGroup({ group, cube, page, info, collapsed }) {
  return (
    <div className="se-group">
      <GroupHeading label={group.label} collapsed={collapsed} />

      {group.pages.map(p => {
        const { available, reason } = pageAvailability(p, info)
        return (
          <Fragment key={p.path}>
            <SidebarItem
              component={Link}
              to={pageHref(cube, p.path)}
              label={p.label}
              reason={reason}
              icon={ICONS[p.icon]}
              collapsed={collapsed}
              active={page === p.path}
              dimmed={!available}
            />
            {group.dividerAfter === p.path && <div className="se-divider" />}
          </Fragment>
        )
      })}
    </div>
  )
}

// SidebarFooter holds the controls pinned to the bottom of the sidebar: Import
// (only on cubes known to be writable), the light/dark switch, and the
// collapse toggle (desktop only).
function SidebarFooter({ cube, page, info, collapsed, onToggleCollapsed, showCollapseToggle }) {
  const colorScheme = useColorSchemeToggle()

  return (
    <div className="se-bottom">
      {info.writable === true && (
        <SidebarItem
          component={Link}
          to={`/${cube}/import`}
          label="Import"
          icon={IconUpload}
          collapsed={collapsed}
          active={page === "import"}
        />
      )}

      <SidebarItem
        component="button"
        onClick={colorScheme.toggle}
        label={colorScheme.label}
        icon={colorScheme.Icon}
        collapsed={collapsed}
      />

      {showCollapseToggle && (
        <SidebarItem
          component="button"
          onClick={onToggleCollapsed}
          label={collapsed ? "Expand" : "Collapse"}
          icon={collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse}
          collapsed={collapsed}
        />
      )}
    </div>
  )
}

// Sidebar is the app's navigation: the cube switcher on top, the page groups in
// a scrolling middle section, and the footer controls at the bottom.
export function Sidebar({ cube, page, info, collapsed, onToggleCollapsed, showCollapseToggle }) {
  let className = "se-sidebar-inner"
  if (collapsed) {
    className += " se-collapsed"
  }

  return (
    <div className={className}>
      <CubeSwitcher cube={cube} collapsed={collapsed} />

      {/* "auto" shows a scrollbar only when the pages don't fit, as on short laptop screens. */}
      <ScrollArea className="se-groups" type="auto" scrollbarSize={6}>
        {NAV_GROUPS.map(group => (
          <SidebarGroup key={group.id} group={group} cube={cube} page={page} info={info} collapsed={collapsed} />
        ))}
      </ScrollArea>

      <SidebarFooter
        cube={cube}
        page={page}
        info={info}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        showCollapseToggle={showCollapseToggle}
      />
    </div>
  )
}
