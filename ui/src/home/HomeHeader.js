import React from "react"
import { Group, Skeleton, Text, Title } from "@mantine/core"

// HomeHeader is the cube home's title row: the cube's name, its description,
// and how many cards it has.
export function HomeHeader({ meta, cardCount, copy }) {
  if (!meta) {
    return <Skeleton height={28} width={320} radius="md" />
  }

  const details = []
  if (meta.description) {
    details.push(meta.description)
  }
  if (cardCount !== undefined) {
    details.push(`${cardCount} ${copy.cards}`)
  }

  return (
    <Group gap="sm" align="baseline" className="home-header">
      <Title order={2} className="home-title">{meta.name}</Title>
      <Text className="home-subtitle">{details.join(" · ")}</Text>
    </Group>
  )
}
