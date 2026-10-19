import React from "react"
import { ActionIcon, Group, Text, Tooltip } from "@mantine/core"
import { SITE_NAME } from "../brand.js"
import { useColorSchemeToggle } from "../shell/useColorSchemeToggle.js"
import "../shell/shell.css"

// WelcomeTopBar is the welcome page's slim header: the logo and site name on
// the left, the light/dark switch on the right. The welcome page has no cube
// yet, so it has no sidebar.
export function WelcomeTopBar() {
  const colorScheme = useColorSchemeToggle()

  return (
    <Group justify="space-between" className="welcome-topbar">
      <Group gap="sm">
        <div className="se-logo" />
        <Text fw={700}>{SITE_NAME}</Text>
      </Group>

      <Tooltip label={colorScheme.label}>
        <ActionIcon variant="subtle" size="lg" onClick={colorScheme.toggle} aria-label={colorScheme.label}>
          <colorScheme.Icon size={18} stroke={1.6} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
