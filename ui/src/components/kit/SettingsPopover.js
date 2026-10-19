import React from "react"
import { ActionIcon, Popover, Stack } from "@mantine/core"
import { IconAdjustments } from "@tabler/icons-react"

// SettingsPopover is the one settings button at the right end of a page's
// toolbar. It opens a small panel holding the page's own knobs (children),
// such as a sort order or a minimum game count. label names the button for
// screen readers.
export function SettingsPopover({ label, children }) {
  return (
    <Popover position="bottom-end" shadow="md">
      <Popover.Target>
        <ActionIcon variant="default" size="md" aria-label={label}>
          <IconAdjustments size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">{children}</Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
