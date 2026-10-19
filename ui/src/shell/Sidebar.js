import React, { Fragment } from "react"
import { Link } from "react-router-dom"
import { NavLink, ScrollArea, Text, Tooltip, useComputedColorScheme, useMantineColorScheme } from "@mantine/core"
import {
  IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconMoon, IconSun, IconUpload,
} from "@tabler/icons-react"
import { NAV_GROUPS, pageAvailability } from "../nav/sections.js"
import { ICONS } from "./icons.js"
import { CubeSwitcher } from "./CubeSwitcher.js"

const ICON_SIZE = 18

// SidebarItem is one sidebar row. Collapsed, it shows only its icon and moves the
// label (and any dimming reason) into a tooltip.
function SidebarItem({ label, reason, icon: Icon, collapsed, active, dimmed, ...linkProps }) {
  const item = (
    <NavLink
      {...linkProps}
      className={"se-item" + (dimmed ? " se-dim" : "")}
      active={active}
      label={collapsed ? null : label}
      leftSection={<Icon size={ICON_SIZE} stroke={1.6} />}
      rightSection={!collapsed && reason ? <span className="se-reason">{reason}</span> : null}
      aria-label={collapsed ? label : undefined}
    />
  )
  return (
    <Tooltip label={reason ? `${label} (${reason})` : label} position="right" disabled={!collapsed} withArrow>
      {item}
    </Tooltip>
  )
}

// Sidebar renders the cube switcher, the page groups from the nav model with
// pages the cube lacks data for dimmed, and the Import, color scheme, and
// collapse controls.
export function Sidebar({ cube, page, info, collapsed, onToggleCollapsed, showCollapseToggle }) {
  const { toggleColorScheme } = useMantineColorScheme()
  const scheme = useComputedColorScheme("light")

  return (
    <div className={"se-sidebar-inner" + (collapsed ? " se-collapsed" : "")}>
      <CubeSwitcher cube={cube} collapsed={collapsed} />
      <ScrollArea className="se-groups" type="never">
        {NAV_GROUPS.map(group => (
          <div key={group.id} className="se-group">
            {group.label && (collapsed
              ? <div className="se-group-line" />
              : <Text className="se-group-label">{group.label}</Text>)}
            {group.pages.map(p => {
              const { available, reason } = pageAvailability(p, info)
              return (
                <Fragment key={p.path}>
                  <SidebarItem
                    component={Link}
                    to={p.path ? `/${cube}/${p.path}` : `/${cube}`}
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
        ))}
      </ScrollArea>
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
          onClick={toggleColorScheme}
          label={scheme === "dark" ? "Light mode" : "Dark mode"}
          icon={scheme === "dark" ? IconSun : IconMoon}
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
    </div>
  )
}
