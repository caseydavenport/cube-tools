// The notice a stats page shows when some of its data didn't load.

import React from "react"
import { Alert, Button, Group, Text } from "@mantine/core"
import "./stats.css"

// LoadFailedNotice shows copy.loadFailed and a copy.retry button that calls
// onRetry, when failed (the names of the page's data that didn't load) isn't
// empty. It shows nothing otherwise. The names stay internal; the viewer only
// needs to know to try again.
export function LoadFailedNotice({ failed, onRetry, copy }) {
  if (failed.length === 0) {
    return null
  }

  return (
    <Alert className="load-failed-notice" color="red" variant="light">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">{copy.loadFailed}</Text>
        <Button size="xs" variant="default" onClick={onRetry}>{copy.retry}</Button>
      </Group>
    </Alert>
  )
}
