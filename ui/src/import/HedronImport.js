import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Alert, Badge, Button, Group, TextInput, UnstyledButton } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { importHedronDraft, listHedronDrafts } from "./importApi.js"
import { HUB_CRUMB, ImportToolbar } from "./ImportToolbar.js"
import { useAction } from "./useAction.js"
import "./import.css"

// HedronDraftRow is one Hedron draft: its event, flight, date and player
// count. Clicking it imports the draft.
function HedronDraftRow({ draft, disabled, onImport }) {
  const date = (draft.date || "").slice(0, 10)
  const playerCount = (draft.players || []).length

  return (
    <li>
      <UnstyledButton className="import-row" onClick={onImport} disabled={disabled}>
        <span className="import-row-title">
          {draft.eventName || draft.draftId}
          {draft.flightName && <span className="import-muted"> · {draft.flightName}</span>}
        </span>
        <Group gap={6} wrap="nowrap">
          <Badge color="gray" variant="light">{date}</Badge>
          <Badge color="gray" variant="light">{playerCount} players</Badge>
        </Group>
      </UnstyledButton>
    </li>
  )
}

// HedronImport lists the drafts Hedron Network holds for a CubeCobra cube id.
// Picking one copies its photos into this cube as a new draft and opens the
// draft's photo review. Decks arrive as anonymous seats (p1, p2, …), with
// each seat's player picked during the review.
export default function HedronImport() {
  const cube = useCube()
  const navigate = useNavigate()
  const [cubeCobraId, setCubeCobraId] = useState("")
  const [drafts, setDrafts] = useState(null)
  const action = useAction()

  async function list() {
    if (!cubeCobraId) {
      return
    }
    const found = await action.run(() => listHedronDrafts(cube, cubeCobraId))
    if (found) {
      setDrafts(found)
    }
  }

  async function importDraft(hedronDraftId) {
    const draftId = await action.run(() => importHedronDraft(cube, cubeCobraId, hedronDraftId))
    if (draftId) {
      navigate(`/${cube}/import/review/${draftId}`)
    }
  }

  return (
    <>
      <ImportToolbar trail={[HUB_CRUMB]} title="Hedron Network" />
      <div className="analyze-page import-page">
        <SectionCard title="CubeCobra cube">
          <Group gap="sm" align="flex-end">
            <TextInput
              label="CubeCobra cube id"
              placeholder="e.g. polyverse"
              value={cubeCobraId}
              onChange={(e) => setCubeCobraId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  list()
                }
              }}
            />
            <Button onClick={list} loading={action.busy && drafts === null} disabled={!cubeCobraId}>List drafts</Button>
          </Group>
        </SectionCard>

        {action.error && <Alert color="red" variant="light">{action.error}</Alert>}

        {drafts && (
          <SectionCard title="Drafts on Hedron">
            {drafts.length === 0 && <EmptyState>No drafts found for that cube.</EmptyState>}
            {drafts.length > 0 && (
              <ul className="import-rows">
                {drafts.map((draft) => (
                  <HedronDraftRow
                    key={draft.draftId}
                    draft={draft}
                    disabled={action.busy}
                    onImport={() => importDraft(draft.draftId)}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
        )}
      </div>
    </>
  )
}
