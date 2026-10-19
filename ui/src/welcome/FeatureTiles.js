import React from "react"
import { Link } from "react-router-dom"
import { SimpleGrid, Text, UnstyledButton } from "@mantine/core"
import { IconAffiliate, IconCamera, IconCards, IconChartBar } from "@tabler/icons-react"
import { MANA } from "../theme/tokens.js"

// The cube the feature tiles open, since every feature page belongs to a cube.
const HOME_CUBE = "polyverse"

// FEATURES lists the welcome page's highlight tiles: where each links within the
// home cube, its icon, its tint, and which COPY entries hold its text.
const FEATURES = [
  { path: "decks", Icon: IconCards, tint: MANA.U, title: "decksTitle", text: "decksText" },
  { path: "cards", Icon: IconChartBar, tint: MANA.R, title: "winsTitle", text: "winsText" },
  { path: "synergy-map", Icon: IconAffiliate, tint: MANA.G, title: "mapTitle", text: "mapText" },
  { path: "import/photos", Icon: IconCamera, tint: MANA.W, title: "importTitle", text: "importText" },
]

// FeatureTile is one highlight: a tinted icon square, a title, and a line of text.
function FeatureTile({ feature, copy }) {
  const iconStyle = { background: `color-mix(in srgb, ${feature.tint} 35%, transparent)` }

  return (
    <UnstyledButton component={Link} to={`/${HOME_CUBE}/${feature.path}`} className="kit-card welcome-feature">
      <div className="welcome-feature-icon" style={iconStyle}>
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
