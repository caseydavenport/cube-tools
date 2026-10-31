// One group's section in the Rules editor: its members listed under the
// condition each first matched, the excluded cards, and "Check a card".

import React, { useEffect, useState } from 'react'
import { Button, UnstyledButton } from '@mantine/core'
import { useCube } from "../../contexts/CubeContext.js"
import { CardLink } from "../../components/CardLink.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { ruleGroupsUrl } from "../../stats/pageRequests.js"
import { cardsText, dotKeys, entryLabel } from "./boardModel.js"
import { GroupCheck } from "./GroupCheck.js"
import "./workspace.css"

// useRuleGroups loads /stats/rule-groups for which, { package } or
// { group }, again whenever refresh changes. It returns { groups, missing,
// failed }: groups is null while loading, missing is true for a 404.
export function useRuleGroups(cube, which, refresh) {
  const [state, setState] = useState({ groups: null, missing: false, failed: false })
  const url = ruleGroupsUrl(cube, which)
  useEffect(() => {
    let alive = true
    fetch(url)
      .then(r => {
        if (r.status === 404) {
          return { missing: true }
        }
        if (!r.ok) {
          throw new Error(r.statusText)
        }
        return r.json()
      })
      .then(body => {
        if (!alive) {
          return
        }
        if (body.missing) {
          setState({ groups: [], missing: true, failed: false })
        } else {
          setState({ groups: body.groups, missing: false, failed: false })
        }
      })
      .catch(() => {
        if (alive) {
          setState({ groups: [], missing: false, failed: true })
        }
      })
    return () => { alive = false }
  }, [url, refresh])
  return state
}

// Dots are a card's color dots.
function Dots({ card }) {
  return (
    <span className="ws-dots">
      {dotKeys(card).map(key => (
        <span key={key} className="ws-dot" style={{ background: `var(--se-mana-${key.toLowerCase()})` }} />
      ))}
    </span>
  )
}

// Member is one card in a group: its dots and name, which opens its card
// page, with the conditions it matched on hover. onExclude, when set, adds a
// button that takes the card out of the group.
function Member({ card, onExclude }) {
  const cube = useCube()
  let info = "Named directly on a wire"
  if (card.matched.length > 0) {
    info = "Matched " + card.matched.join(" and ")
  }
  return (
    <div className="ws-member">
      <Dots card={card} />
      <HoverInfo title={card.name} info={info}>
        <span className="ws-member-name"><CardLink cube={cube} name={card.name} /></span>
      </HoverInfo>
      {onExclude && (
        <UnstyledButton className="ws-member-x" title="Leave this card out of the group" onClick={() => onExclude(card.name)}>×</UnstyledButton>
      )}
    </div>
  )
}

// alsoUsedBy names the packages other than packageName whose wires use the
// group, each once.
function alsoUsedBy(uses, packageName) {
  const out = []
  for (const use of uses) {
    if (use.package !== packageName && !out.includes(use.package)) {
      out.push(use.package)
    }
  }
  return out
}

// memberCount is how many cards the group holds across its conditions.
function memberCount(members) {
  let count = 0
  for (const c of members.conditions) {
    count += c.cards.length
  }
  return count
}

// GroupSection shows one entry of the rules, from /stats/rule-groups. group
// is the rules group, or null for a card entry or a group the rules don't
// define. warning names what's broken in the group, or is null. onEdit,
// onExclude and onRestore are only used when canEdit is true; a null
// onEdit hides the section's Edit button.
export function GroupSection({ id, members, group, packageName, color, warning, canEdit, onEdit, onExclude, onRestore, onOpenPackage, initialCheck }) {
  const others = alsoUsedBy(members.uses, packageName)
  const count = memberCount(members)

  let note = cardsText(count)
  if (members.card_entry) {
    note = "Named directly"
  } else if (members.missing) {
    note = `No group named ${members.name}`
  }

  let excludeCard = null
  if (canEdit && group) {
    excludeCard = onExclude
  }

  return (
    <section id={id} className="kit-card ws-group">
      <div className="ws-group-head">
        <span className="dm-swatch" style={{ background: color }} />
        <span className="ws-group-name">{entryLabel(members.name)}</span>
        <span className="ws-group-note">{note}</span>
        {canEdit && group && onEdit && <Button size="xs" variant="default" className="ws-group-edit" onClick={onEdit}>Edit group</Button>}
      </div>
      {warning && <div className="ws-warning">{warning}</div>}

      {members.conditions.map(c => (
        <div key={c.condition} className="ws-condition">
          {!members.card_entry && (
            <div className="ws-condition-head">
              <code className="de-cond">{c.condition}</code>
              <span className="ws-group-note">{cardsText(c.cards.length)}</span>
            </div>
          )}
          <div className="ws-members">
            {c.cards.map(card => <Member key={card.name} card={card} onExclude={excludeCard} />)}
          </div>
        </div>
      ))}

      {members.excluded.length > 0 && (
        <div className="ws-condition">
          <div className="ws-condition-head"><span className="ws-group-note">Excluded</span></div>
          <div className="ws-members">
            {members.excluded.map(card => (
              <div key={card.name} className="ws-member ws-member-excluded">
                <Dots card={card} />
                <span className="ws-member-name">{card.name}</span>
                {canEdit && (
                  <UnstyledButton className="ws-member-x" title="Put this card back in the group" onClick={() => onRestore(card.name)}>↺</UnstyledButton>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div className="ws-also">
          Also used by:{' '}
          {others.map((name, i) => (
            <span key={name}>
              {i > 0 && ', '}
              <UnstyledButton className="ws-also-link" onClick={() => onOpenPackage(name)}>{name}</UnstyledButton>
            </span>
          ))}
        </div>
      )}

      {group && <GroupCheck key={group.name} group={group} initialCard={initialCheck} />}
    </section>
  )
}
