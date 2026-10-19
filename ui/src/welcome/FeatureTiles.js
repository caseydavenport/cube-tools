import React from "react"
import { Link } from "react-router-dom"
import { SimpleGrid, Text, UnstyledButton } from "@mantine/core"
import { IconAffiliate, IconCamera, IconCards, IconChartBar } from "@tabler/icons-react"

// The cube the feature tiles open, since every feature page belongs to a cube.
const HOME_CUBE = "polyverse"

// FEATURES lists the welcome page's highlight tiles: where each links within the
// home cube, its icon, and which COPY entries hold its text. Icon is written
// with a capital I because React only treats capitalized names as components.
const FEATURES = [
  { path: "decks", Icon: IconCards, title: "decksTitle", text: "decksText" },
  { path: "cards", Icon: IconChartBar, title: "winsTitle", text: "winsText" },
  { path: "synergy-map", Icon: IconAffiliate, title: "mapTitle", text: "mapText" },
  { path: "import/photos", Icon: IconCamera, title: "importTitle", text: "importText" },
]

// FeatureTile is one highlight: an icon on a soft violet square, a title, and a
// line of text. Mana colors stay reserved for Magic colors, so the tint is the
// theme's primary color.
function FeatureTile({ feature, copy }) {
  return (
    <UnstyledButton component={Link} to={`/${HOME_CUBE}/${feature.path}`} className="kit-card welcome-feature">
      <div className="welcome-feature-icon">
        <feature.Icon size={18} stroke={1.6} />
      </div>
      <Text fw={700} size="sm" mt={10}>{copy[feature.title]}</Text>
      <Text className="welcome-muted">{copy[feature.text]}</Text>
    </UnstyledButton>
  )
}

// FeatureTiles is the row of feature highlights, each opening its page.
export function FeatureTiles({ copy }) {
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
      {FEATURES.map(feature => (
        <FeatureTile key={feature.path} feature={feature} copy={copy} />
      ))}
    </SimpleGrid>
  )
}
