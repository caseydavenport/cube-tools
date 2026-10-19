import React, { useEffect, useState } from "react"
import { useLocation, useParams } from "react-router-dom"
import { AppShell, Burger, Group, Text } from "@mantine/core"
import { useDisclosure, useMediaQuery } from "@mantine/hooks"
import { SITE_NAME } from "../brand.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { ChartSchemeSync } from "./ChartSchemeSync.js"
import { Sidebar } from "./Sidebar.js"
import { readCollapsed, writeCollapsed } from "./sidebarPrefs.js"
import { pageSegment } from "./paths.js"
import "./shell.css"

// AppShell switches to its phone layout just below Mantine's "sm" breakpoint
// (48em). This query matches the same widths, so the top bar and the sidebar
// drawer change over at exactly the same point.
const PHONE_QUERY = "(max-width: 47.99em)"

const SIDEBAR_WIDTH = 232
const RAIL_WIDTH = 64
const TOP_BAR_HEIGHT = 52

// useSidebarCollapsed holds whether the desktop sidebar is shrunk to an icon
// rail, starting from and saving to the viewer's browser storage.
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    writeCollapsed(next)
  }

  return [collapsed, toggleCollapsed]
}

// MobileTopBar is the slim bar shown on phones, with the button that opens the
// sidebar drawer.
function MobileTopBar({ drawerOpen, onToggleDrawer }) {
  return (
    <AppShell.Header className="se-topbar">
      <Group h="100%" px="md" gap="sm">
        <Burger opened={drawerOpen} onClick={onToggleDrawer} size="sm" aria-label="Open navigation" />
        <Text fw={700}>{SITE_NAME}</Text>
      </Group>
    </AppShell.Header>
  )
}

// AppLayout wraps every cube page in the app shell: a sidebar on desktop that
// collapses to an icon rail, and a top bar with a drawer on phones.
export function AppLayout({ children }) {
  const { cube } = useParams()
  const location = useLocation()
  const info = useCubeInfo(cube)
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const [drawerOpen, drawer] = useDisclosure(false)

  // Read the screen size on the first render, so phones don't flash the
  // desktop layout for a frame.
  const isPhone = useMediaQuery(PHONE_QUERY, undefined, { getInitialValueInEffect: false })

  // Close the phone drawer after each navigation.
  useEffect(() => {
    drawer.close()
  }, [location.pathname])

  // The icon rail only exists on desktop; the phone drawer is always full width.
  const showRail = collapsed && !isPhone

  return (
    <AppShell
      header={{ height: TOP_BAR_HEIGHT, collapsed: !isPhone }}
      navbar={{
        width: showRail ? RAIL_WIDTH : SIDEBAR_WIDTH,
        breakpoint: "sm",
        collapsed: { mobile: !drawerOpen },
      }}
      padding={0}
    >
      <MobileTopBar drawerOpen={drawerOpen} onToggleDrawer={drawer.toggle} />

      <AppShell.Navbar className="se-sidebar">
        <Sidebar
          cube={cube}
          page={pageSegment(location.pathname)}
          info={info}
          collapsed={showRail}
          onToggleCollapsed={toggleCollapsed}
          showCollapseToggle={!isPhone}
        />
      </AppShell.Navbar>

      <ChartSchemeSync />
      <AppShell.Main className="se-main">{children}</AppShell.Main>
    </AppShell>
  )
}
