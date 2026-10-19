import React, { useEffect, useState } from "react"
import { useLocation, useParams } from "react-router-dom"
import { AppShell, Burger, Group, Text } from "@mantine/core"
import { useDisclosure, useMediaQuery } from "@mantine/hooks"
import { SITE_NAME } from "../brand.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { Sidebar } from "./Sidebar.js"
import { readCollapsed, writeCollapsed } from "./sidebarPrefs.js"
import "./shell.css"

// AppLayout wraps every cube page in the app shell: a sidebar on desktop that
// collapses to an icon rail, and a top bar with a drawer below the sm breakpoint.
export function AppLayout({ children }) {
  const { cube } = useParams()
  const location = useLocation()
  const info = useCubeInfo(cube)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, drawer] = useDisclosure(false)
  const mobile = useMediaQuery("(max-width: 48em)") ?? false
  const page = location.pathname.split("/").filter(Boolean)[1] || ""

  useEffect(() => drawer.close(), [location.pathname])

  function toggleCollapsed() {
    setCollapsed(c => {
      writeCollapsed(!c)
      return !c
    })
  }

  const rail = collapsed && !mobile
  return (
    <AppShell
      header={{ height: 52, collapsed: !mobile }}
      navbar={{ width: rail ? 64 : 232, breakpoint: "sm", collapsed: { mobile: !drawerOpen } }}
      padding={0}
    >
      <AppShell.Header className="se-topbar">
        <Group h="100%" px="md" gap="sm">
          <Burger opened={drawerOpen} onClick={drawer.toggle} size="sm" aria-label="Open navigation" />
          <Text fw={700}>{SITE_NAME}</Text>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar className="se-sidebar">
        <Sidebar
          cube={cube}
          page={page}
          info={info}
          collapsed={rail}
          onToggleCollapsed={toggleCollapsed}
          showCollapseToggle={!mobile}
        />
      </AppShell.Navbar>
      <AppShell.Main className="se-main">{children}</AppShell.Main>
    </AppShell>
  )
}
