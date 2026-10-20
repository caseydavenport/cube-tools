// The Rules editor's left rail: every group and link, with a filter.

import React, { useState } from 'react'
import { ActionIcon, TextInput, UnstyledButton } from '@mantine/core'
import { IconPlus, IconSearch } from '@tabler/icons-react'
import { ruleColor } from '../map/ruleColors.js'

// Registry is the left rail: every group and link with live counts and warning
// dots. One filter box narrows both lists.
export function Registry({
  groups, links, view, groupCards, linkEdgeCounts, groupWarn, linkWarn, canEdit,
  onSelectGroup, onSelectLink, onNewGroup, onNewLink,
}) {
  const [filter, setFilter] = useState('')
  const [closed, setClosed] = useState({})
  const q = filter.trim().toLowerCase()
  const shownGroups = q ? groups.filter(g => g.name.toLowerCase().includes(q)) : groups
  const shownLinks = q ? links.filter(l => l.label.toLowerCase().includes(q)) : links
  const toggle = (key) => setClosed(c => ({ ...c, [key]: !c[key] }))
  const isOpen = (key) => Boolean(q) || !closed[key]

  return (
    <aside className="de-registry">
      <TextInput
        size="xs" leftSection={<IconSearch size={14} />}
        placeholder="Filter groups & links…" aria-label="Filter groups and links"
        value={filter} onChange={e => setFilter(e.target.value)} spellCheck={false}
      />

      <div className="de-reg-head" onClick={() => toggle('groups')} role="button" aria-expanded={isOpen('groups')}>
        <span className="de-reg-caret">{isOpen('groups') ? '▾' : '▸'}</span>
        <span>Groups</span>
        <span className="de-reg-count">{groups.length}</span>
        {canEdit && <AddButton label="New group" onClick={onNewGroup} />}
      </div>
      {isOpen('groups') && <div className="de-reg-list">
        {shownGroups.map(g => {
          const warn = groupWarn(g.name)
          const active = view === 'g:' + g.name
          const color = ruleColor(groups.indexOf(g))
          return (
            <UnstyledButton
              key={g.name} className="de-row" data-active={active || undefined}
              style={active ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
              onClick={() => onSelectGroup(g.name)}
            >
              <span className="dm-swatch" style={{ background: color }} />
              <span className="de-row-name">{g.name}</span>
              {warn && <span className="de-warn-dot" title={warn} />}
              <span className="de-row-count">{groupCards[g.name]?.card_count ?? (groupCards[g.name]?.cards || []).length}</span>
            </UnstyledButton>
          )
        })}
        {shownGroups.length === 0 && <div className="de-muted">No groups match.</div>}
      </div>}

      <div className="de-reg-head" onClick={() => toggle('links')} role="button" aria-expanded={isOpen('links')}>
        <span className="de-reg-caret">{isOpen('links') ? '▾' : '▸'}</span>
        <span>Links</span>
        <span className="de-reg-count">{links.length}</span>
        {canEdit && <AddButton label="New link" onClick={onNewLink} />}
      </div>
      {isOpen('links') && <div className="de-reg-list">
        {shownLinks.map(l => {
          const warn = linkWarn(l.label)
          const active = view === 'l:' + l.label
          const color = ruleColor(links.indexOf(l))
          return (
            <UnstyledButton
              key={l.label} className="de-row" data-active={active || undefined}
              style={active ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
              onClick={() => onSelectLink(l.label)}
            >
              <span className="dm-swatch de-swatch-link" style={{ background: color }} />
              <span className="de-row-name">{l.label}</span>
              {warn && <span className="de-warn-dot" title={warn} />}
              <span className="de-row-count">{linkEdgeCounts[l.label] || 0}</span>
            </UnstyledButton>
          )
        })}
        {shownLinks.length === 0 && <div className="de-muted">No links match.</div>}
      </div>}
    </aside>
  )
}

// AddButton is the + on a registry heading. The heading itself folds the list
// open and shut, so the click stops here instead of also toggling it.
function AddButton({ label, onClick }) {
  function handleClick(e) {
    e.stopPropagation()
    onClick()
  }

  return (
    <ActionIcon variant="default" size="sm" aria-label={label} title={label} onClick={handleClick}>
      <IconPlus size={12} />
    </ActionIcon>
  )
}
