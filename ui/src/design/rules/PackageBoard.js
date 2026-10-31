// The Rules editor's home: a card per package, then the groups no package
// uses. The toolbar's search filters both.

import React from 'react'
import { Button, SegmentedControl, UnstyledButton } from '@mantine/core'
import { useNavigate } from "react-router-dom"
import { useCube } from "../../contexts/CubeContext.js"
import { linkCheckHref } from "../../shell/paths.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { ruleColor } from '../map/ruleColors.js'
import { badges, cardsText, colorShares, filterBoard, linkPair, sortPackages, wiringSummary } from "./boardModel.js"
import "./board.css"

// HITS_SHOWN is how many matching cards a package card lists under a search.
const HITS_SHOWN = 3

// ColorBar is a package's cards split by color, colorless spells and lands.
function ColorBar({ colors }) {
  return (
    <div className="rb-colorbar">
      {colorShares(colors).map(s => (
        <div key={s.key} style={{ width: s.pct + '%', background: `var(--se-mana-${s.key.toLowerCase()})` }} />
      ))}
    </div>
  )
}

// Badge is one small note on a package card.
function Badge({ badge }) {
  return <span className={'rb-badge rb-badge-' + badge.kind}>{badge.text}</span>
}

// PackageCard is one package on the board. hits are the cards a search
// matched in it, shown under its badges.
function PackageCard({ pkg, color, problem, hits, onOpen }) {
  const built = Math.round(pkg.stat.buildRate * 100)
  return (
    <UnstyledButton className="rb-card" onClick={onOpen}>
      <div className="rb-card-name">
        <span className="dm-swatch" style={{ background: color }} />
        {pkg.name}
      </div>
      <div className="rb-card-wiring">{wiringSummary(pkg)}</div>
      <ColorBar colors={pkg.colors} />
      <div className="rb-built">
        <span>Built in {built}% of decks</span>
        <div className="rb-built-track"><div className="rb-built-fill" style={{ width: built + '%' }} /></div>
      </div>
      <div className="rb-badges">
        {badges(pkg, problem).map(b => <Badge key={b.text} badge={b} />)}
      </div>
      {hits.length > 0 && (
        <div className="rb-hits">
          {hits.slice(0, HITS_SHOWN).map(h => <div key={h.card + h.group}>{h.card} · {h.group}</div>)}
          {hits.length > HITS_SHOWN && <div>+{hits.length - HITS_SHOWN} more</div>}
        </div>
      )}
    </UnstyledButton>
  )
}

// BoardHeader is the one line of rulebook totals above the grid.
function BoardHeader({ packageCount, groupCount, pairCount, coverage }) {
  return (
    <div className="rb-header">
      {packageCount} packages · {groupCount} groups ·{' '}
      <HoverInfo info="Pairs of cube cards that at least one package links. Cards cut from the cube aren't counted.">
        <span className="rb-tip">{pairCount.toLocaleString()} linked card pairs</span>
      </HoverInfo>
      {coverage !== null && <> · {coverage}% of cube cards in a group</>}
    </div>
  )
}

// PackageBoard lays out the board for board, the /stats/rules-board answer,
// filtered by q and sorted by sort ("az" or "built"). problemOf names what's
// broken in a package, or returns null. totals holds the header's counts.
export function PackageBoard({ board, q, sort, cardNames, totals, problemOf, onOpenPackage, onOpenGroup, onSort }) {
  const cube = useCube()
  const navigate = useNavigate()
  const filtered = filterBoard(board, q)

  // Sort the matching packages, keeping each one's board position for its color.
  const sorted = sortPackages(filtered.packages.map(m => m.pkg), sort)
  const byName = new Map(filtered.packages.map(m => [m.pkg.name, m]))

  const pair = linkPair(q, cardNames)
  return (
    <div className="rb-board">
      {pair && (
        <Button size="xs" className="rb-pair" onClick={() => navigate(linkCheckHref(cube, pair.a, pair.b))}>
          Check the link between {pair.a} and {pair.b}
        </Button>
      )}
      <div className="rb-toolbar">
        <BoardHeader packageCount={board.packages.length} groupCount={totals.groups} pairCount={totals.pairs} coverage={totals.coverage} />
        <SegmentedControl
          size="xs" aria-label="Sort packages" value={sort} onChange={onSort}
          data={[{ value: 'az', label: 'A–Z' }, { value: 'built', label: 'Most built' }]}
        />
      </div>

      {sorted.length === 0 && !pair && <div className="de-muted">No packages match.</div>}
      <div className="rb-grid">
        {sorted.map(pkg => {
          const match = byName.get(pkg.name)
          return (
            <PackageCard
              key={pkg.name} pkg={pkg} color={ruleColor(match.index)}
              problem={problemOf(pkg.name)} hits={match.hits}
              onOpen={() => onOpenPackage(pkg.name)}
            />
          )
        })}
      </div>

      {filtered.unused.length > 0 && <>
        <div className="de-subhead">Groups no package uses</div>
        <div className="rb-grid rb-grid-small">
          {filtered.unused.map(g => {
            let countClass = "rb-group-count"
            if (g.cards.length === 0) {
              countClass += " rb-group-empty"
            }
            return (
              <UnstyledButton key={g.name} className="rb-card rb-card-small" onClick={() => onOpenGroup(g.name)}>
                <span className="rb-card-name">{g.name}</span>
                <span className={countClass}>{cardsText(g.cards.length)}</span>
              </UnstyledButton>
            )
          })}
        </div>
      </>}
    </div>
  )
}
