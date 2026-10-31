// A package opened full width in the Rules editor: its numbers, its wiring,
// and a section per group with the group's members by condition.

import React, { useState } from 'react'
import { Anchor, UnstyledButton } from '@mantine/core'
import { Link } from "react-router-dom"
import { useCube } from "../../contexts/CubeContext.js"
import { packagePageHref } from "../../shell/paths.js"
import { DetailHeader } from "../../components/kit/DetailHeader.js"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { StatTile } from "../../components/kit/StatTile.js"
import { ruleColor } from '../map/ruleColors.js'
import { badges, entryLabel } from "./boardModel.js"
import { EditActions } from "./rulesParts.js"
import { GroupSection, useRuleGroups } from "./GroupSection.js"
import "./workspace.css"

// sectionId is the page id of a group's section, for the wiring chips to
// scroll to.
function sectionId(entry) {
  return "rg-" + entry.replace(/[^A-Za-z0-9]+/g, "-")
}

// scrollToSection scrolls a group's section into view. Hash links would
// change the app's route, so the chips scroll by id instead.
function scrollToSection(entry) {
  const el = document.getElementById(sectionId(entry))
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" })
  }
}

// WireChips are one side of a wire, each chip jumping to its group's section.
function WireChips({ entries }) {
  return (
    <span className="ws-wire-side">
      {entries.map(entry => (
        <UnstyledButton key={entry} className="kit-chip kit-chip-neutral ws-chip" onClick={() => scrollToSection(entry)}>
          {entryLabel(entry)}
        </UnstyledButton>
      ))}
    </span>
  )
}

// percent turns a 0-1 rate into a whole percent string.
function percent(rate) {
  return Math.round(rate * 100) + "%"
}

// PackageWorkspace is the open package: pkg is its /stats/rules-board entry
// and index its position there, for colors. groupsByName finds each rules
// group, so a section can offer Edit and Check a card. problem and
// warningOf name what's broken, or are null.
export function PackageWorkspace({
  pkg, index, groupsByName, groupIndex, problem, warningOf, canEdit, refresh, initialCheck,
  onBack, onEditPackage, onDeletePackage, onEditGroup, onExclude, onRestore, onOpenPackage,
}) {
  const cube = useCube()
  const [confirming, setConfirming] = useState(false)
  const { groups, failed } = useRuleGroups(cube, { package: pkg.name }, refresh)

  const actions = <>
    <Anchor component={Link} to={packagePageHref(cube, pkg.name)} size="sm">Package page →</Anchor>
    {canEdit && <EditActions confirming={confirming} setConfirming={setConfirming} onEdit={onEditPackage} onDelete={onDeletePackage} />}
  </>

  const stat = pkg.stat
  const tiles = <>
    <StatTile label="Cards" value={stat.cardCount} />
    <StatTile label="Groups" value={pkg.groups.length} />
    <StatTile label="Built in" value={percent(stat.buildRate)} />
    <StatTile label="Decks with the cards" value={stat.has3} tip="Decks with 3 or more of the package's cards." />
    <StatTile label="Came together" value={percent(stat.cameTogether)} tip="Of the decks with 3 or more of its cards, the share that built the package." />
  </>

  let sections = <div className="de-muted">Loading…</div>
  if (failed) {
    sections = <div className="de-muted">Couldn't load this package's groups.</div>
  } else if (groups) {
    sections = groups.map(members => {
      const group = groupsByName[members.name] || null
      let color = "var(--se-muted)"
      if (groupIndex[members.name] !== undefined) {
        color = ruleColor(groupIndex[members.name])
      }
      return (
        <GroupSection
          key={members.name} id={sectionId(members.name)} members={members} group={group}
          packageName={pkg.name} color={color} warning={warningOf(members.name)} canEdit={canEdit}
          onEdit={() => onEditGroup(members.name)} onExclude={card => onExclude(members.name, card)}
          onRestore={card => onRestore(members.name, card)} onOpenPackage={onOpenPackage}
          initialCheck={initialCheck}
        />
      )
    })
  }

  return (
    <div className="ws-page">
      <UnstyledButton className="ws-back" onClick={onBack}>← All packages</UnstyledButton>
      <DetailHeader title={<><span className="dm-swatch dm-swatch-lg" style={{ background: ruleColor(index) }} /> {pkg.name}</>} actions={actions} tiles={tiles}>
        <div className="rb-badges">
          {badges(pkg, problem).map(b => <span key={b.text} className={'rb-badge rb-badge-' + b.kind}>{b.text}</span>)}
        </div>
      </DetailHeader>

      <SectionCard title="Wiring">
        {pkg.wires.map((w, i) => (
          <div key={i} className="ws-wire">
            <WireChips entries={w.sources} />
            <span className="ws-wire-join">↔</span>
            <WireChips entries={w.targets} />
          </div>
        ))}
      </SectionCard>

      {sections}
    </div>
  )
}
