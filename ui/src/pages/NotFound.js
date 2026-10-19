import React from "react"
import { Link, useParams } from "react-router-dom"
import { Anchor, Stack, Text, Title } from "@mantine/core"

// NotFound is the catch-all for unknown paths, including the pre-redesign route
// names, which were dropped without redirects.
export default function NotFound() {
  const { cube } = useParams()
  return (
    <Stack align="center" gap="xs" py={80}>
      <Title order={2}>Page not found</Title>
      <Text c="dimmed">
        <Anchor component={Link} to={cube ? `/${cube}` : "/"}>
          {cube ? "Go to the cube home" : "Go to the home page"}
        </Anchor>
      </Text>
    </Stack>
  )
}
