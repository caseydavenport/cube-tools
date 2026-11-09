import React, { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { Alert, Badge, Button, Group, Progress, Text, UnstyledButton } from "@mantine/core"
import { useCube } from "../../contexts/CubeContext.js"
import { EmptyState } from "../../components/kit/EmptyState.js"
import { draftLabel } from "../../utils/DraftInfo.js"
import { fetchPlayers } from "../../utils/Players.js"
import { getDraftScan, loadConsistency, loadDraftCards, loadPhotoDraft, startDraftScan } from "../importApi.js"
import { ConsistencyPanel } from "../ConsistencyPanel.js"
import { HUB_CRUMB, ImportToolbar } from "../ImportToolbar.js"
import { errorText } from "../useAction.js"
import { FixableProblem } from "./CaptureFix.js"
import "../import.css"

// SCAN_POLL_MS is how often the page checks a running scan's progress.
const SCAN_POLL_MS = 1500

// seatLabel names a seat by its id and, once picked, its player.
export function seatLabel(seat, players) {
  if (!seat.player_id) {
    return seat.id
  }
  const player = players.find((p) => p.id === seat.player_id)
  if (player) {
    return `${seat.id} · ${player.name}`
  }
  return `${seat.id} · player #${seat.player_id}`
}

// isDeckOnly says whether a draft's photos are all deck photos. Those drafts
// never see most of the cube, so cards not seen yet aren't worth listing.
function isDeckOnly(draft) {
  return draft.players.every((seat) => (seat.photos.checkin || []).length === 0 && (seat.photos.checkout || []).length === 0)
}

// usePhotoDraft loads a photo draft by id and reloads it on demand. It returns
// the draft (null while loading), the load error, and reload.
export function usePhotoDraft(cube, draftId) {
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState("")

  const reload = useCallback(async () => {
    try {
      setDraft(await loadPhotoDraft(cube, draftId))
      setError("")
    } catch (e) {
      setError(errorText(e))
    }
  }, [cube, draftId])

  useEffect(() => {
    setDraft(null)
    reload()
  }, [reload])

  return { draft, error, reload }
}

// usePlayers loads the player list, for naming seats.
export function usePlayers() {
  const [players, setPlayers] = useState([])
  useEffect(() => {
    fetchPlayers().then(setPlayers).catch(() => {})
  }, [])
  return [players, setPlayers]
}

// ScanBar starts a scan of every photo not read yet and shows its progress.
// Photos with boxes are skipped, so the scan never overwrites checked work.
function ScanBar({ cube, draftId, onScanned }) {
  const [scan, setScan] = useState(null)
  const [error, setError] = useState("")

  // Pick up a scan already running, as after a page reload.
  useEffect(() => {
    getDraftScan(cube, draftId).then(setScan).catch(() => {})
  }, [cube, draftId])

  const running = Boolean(scan) && scan.state === "running"

  // While a scan runs, poll its progress. When it ends, reload the draft so
  // each seat's progress shows the new boxes.
  useEffect(() => {
    if (!running) {
      return undefined
    }
    const timer = setTimeout(async () => {
      try {
        const latest = await getDraftScan(cube, draftId)
        setScan(latest)
        if (latest.state !== "running") {
          onScanned()
        }
      } catch (e) {
        setError(errorText(e))
      }
    }, SCAN_POLL_MS)
    return () => clearTimeout(timer)
  }, [cube, draftId, scan, running, onScanned])

  async function start() {
    setError("")
    try {
      setScan(await startDraftScan(cube, draftId))
    } catch (e) {
      setError(errorText(e))
    }
  }

  let progress = 0
  if (running && scan.total) {
    progress = (scan.done / scan.total) * 100
  }

  return (
    <Group gap="md">
      <Button variant="default" onClick={start} loading={running}>Scan unread photos</Button>
      {running && (
        <Group gap="sm" wrap="nowrap">
          <Progress value={progress} w={140} />
          <Text size="sm" c="dimmed">{scan.done} of {scan.total}</Text>
        </Group>
      )}
      {scan && scan.state === "done" && scan.total > 0 && <Text size="sm" c="dimmed">Scanned {scan.total} photos.</Text>}
      {scan && scan.error && <Text size="sm" c="red">Some photos failed: {scan.error}</Text>}
      {error && <Text size="sm" c="red">{error}</Text>}
    </Group>
  )
}

// SeatRows lists the draft's seats with their progress, each linking to its
// workspace.
function SeatRows({ cube, draft, players }) {
  return (
    <ul className="import-rows">
      {draft.players.map((seat) => {
        const poolPhotos = (seat.photos.checkin || []).length + (seat.photos.checkout || []).length
        const deckPhotos = (seat.photos.deck || []).length
        return (
          <li key={seat.id}>
            <UnstyledButton component={Link} to={`/${cube}/import/review/${draft.draft.id}/${seat.id}`} className="import-row">
              <span className="import-row-title">
                <span className={`import-dot import-seat-${seat.status || "unstarted"}`} />
                {seatLabel(seat, players)}
              </span>
              <Group gap={6} wrap="nowrap">
                {seat.needs_reconfirm && <Badge color="orange" variant="light">Reconfirm</Badge>}
                {seat.warnings && seat.warnings.length > 0 && (
                  <Badge color="yellow" variant="light" title={seat.warnings.join("\n")}>
                    {seat.warnings.length} warning{seat.warnings.length === 1 ? "" : "s"}
                  </Badge>
                )}
                <Text size="sm" c="dimmed">{poolPhotos} pool · {deckPhotos} deck photos</Text>
              </Group>
            </UnstyledButton>
          </li>
        )
      })}
    </ul>
  )
}

// DraftReviewPage is one photo draft's review: scan its photos, check the cards
// read so far against the cube and fix misreads, and open each seat to check
// its cards and write its deck.
export default function DraftReviewPage() {
  const cube = useCube()
  const { draftId } = useParams()
  const { draft, error, reload } = usePhotoDraft(cube, draftId)
  const [players] = usePlayers()
  const [report, setReport] = useState(null)
  const [cards, setCards] = useState([])
  const [fixError, setFixError] = useState("")

  const reloadReport = useCallback(async () => {
    try {
      setReport(await loadConsistency(cube, draftId))
    } catch {
      setReport(null)
    }
  }, [cube, draftId])

  // The check reloads with the draft, which also happens after each scan.
  useEffect(() => {
    if (draft) {
      reloadReport()
    }
  }, [draft, reloadReport])

  useEffect(() => {
    loadDraftCards(cube, draftId).then(setCards).catch(() => setCards([]))
  }, [cube, draftId])

  let title = `Draft ${draftId}`
  if (draft) {
    title = draftLabel(draft.draft)
  }
  const toolbar = <ImportToolbar trail={[HUB_CRUMB]} title={title} />

  if (error) {
    return (
      <>
        {toolbar}
        <div className="analyze-page import-page"><EmptyState>Couldn't load this draft: {error}</EmptyState></div>
      </>
    )
  }
  if (!draft) {
    return (
      <>
        {toolbar}
        <div className="analyze-page import-page"><EmptyState>Loading…</EmptyState></div>
      </>
    )
  }

  const discrepancies = (report && report.discrepancies) || []
  const missingNames = discrepancies.filter((d) => d.kind === "missing").map((d) => d.card_name)

  return (
    <>
      {toolbar}
      <div className="analyze-page import-page">
        <ScanBar cube={cube} draftId={draftId} onScanned={reload} />

        {fixError && <Alert color="red" variant="light" withCloseButton onClose={() => setFixError("")}>{fixError}</Alert>}

        {report && (
          <ConsistencyPanel
            summary={`${report.pool_total} of ${report.cube_total} cube cards seen · ${report.players_counted} of ${report.players_total} seats read`}
            discrepancies={discrepancies}
            hideMissing={isDeckOnly(draft)}
            renderProblem={(discrepancy) => (
              <FixableProblem
                discrepancy={discrepancy}
                cube={cube}
                draftId={draftId}
                cards={cards}
                missingNames={missingNames}
                onFixed={reloadReport}
                onError={(e) => setFixError(`Couldn't fix the box: ${errorText(e)}`)}
              />
            )}
          />
        )}

        <SeatRows cube={cube} draft={draft} players={players} />
      </div>
    </>
  )
}
