import React from "react"
import { Link, Navigate } from "react-router-dom"
import { Text, UnstyledButton } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { ImportToolbar } from "./ImportToolbar.js"
import { PhotoReviewList } from "./photos/PhotoReviewList.js"
import "./import.css"

// SOURCES are the hub's cards, one per way to bring a draft in. Hedron and the
// photo folder share the photo review behind them, but each keeps its own card
// so both are easy to find.
const SOURCES = [
  {
    path: "decklists",
    title: "Decklists",
    blurb: "Paste decklists or upload .txt and Delver Lens .csv files.",
  },
  {
    path: "hedron",
    title: "Hedron Network",
    blurb: "Fetch a draft's photos from Hedron by CubeCobra id, then read the cards off them.",
  },
  {
    path: "photos",
    title: "Photo folder",
    blurb: "Upload one deck photo per player, then read the cards off them.",
  },
]

// ImportHub is the /import landing page: a card per import source, and the
// drafts whose photos are under review.
export default function ImportHub() {
  const cube = useCube()

  return (
    <>
      <ImportToolbar title="Import" />
      <div className="analyze-page import-page">
        <ul className="import-sources">
          {SOURCES.map((source) => (
            <li key={source.path}>
              <UnstyledButton component={Link} to={`/${cube}/import/${source.path}`} className="kit-card import-source">
                <Text fw={600}>{source.title}</Text>
                <Text size="sm" c="dimmed">{source.blurb}</Text>
              </UnstyledButton>
            </li>
          ))}
        </ul>

        <SectionCard title="Photo reviews">
          <PhotoReviewList />
        </SectionCard>
      </div>
    </>
  )
}

// ToImportHub sends an unknown /import address, such as one of the old
// /import/paste or /import/ocr pages, to the hub.
export function ToImportHub() {
  const cube = useCube()
  return <Navigate to={`/${cube}/import`} replace />
}
