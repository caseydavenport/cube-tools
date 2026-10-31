// The Rules editor's toolbar: its views, the one search bar, and the buttons
// that start something new.

import React from 'react'
import { Button, SegmentedControl, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { Link } from "react-router-dom"
import { pageHref } from "../../shell/paths.js"
import { PageToolbar } from '../../toolbar/PageToolbar.js'

// toolbarValue maps the view= parameter to the segment it lights up. The
// board, a package and a group all light up Packages.
function toolbarValue(view) {
  if (view === 'review') {
    return 'review'
  }
  return 'board'
}

// EditorToolbar is the page toolbar. Typing in the search runs onSearch,
// which filters the package board. New package and New group show only
// when the cube can be edited.
export function EditorToolbar({ view, q, onSearch, onSelectView, canEdit, onNewPackage, onNewGroup, cube }) {
  const views = [
    { value: 'board', label: 'Packages' },
    { value: 'review', label: 'Review' },
  ]

  function onChange(value) {
    if (value === 'board') {
      onSelectView('')
    } else {
      onSelectView(value)
    }
  }

  let newButtons = null
  if (canEdit) {
    newButtons = <>
      <Button size="xs" variant="default" onClick={onNewPackage}>New package</Button>
      <Button size="xs" variant="default" onClick={onNewGroup}>New group</Button>
    </>
  }

  return (
    <PageToolbar title="Rules editor">
      <SegmentedControl size="xs" aria-label="Rules editor views" data={views} value={toolbarValue(view)} onChange={onChange} />
      <TextInput
        size="xs" className="de-search" leftSection={<IconSearch size={14} />}
        placeholder="Search packages, groups or cards" aria-label="Search packages, groups or cards"
        value={q} onChange={e => onSearch(e.target.value)} spellCheck={false}
      />
      <Button component={Link} to={pageHref(cube, "rules-editor/link")} size="xs" variant="default">Link check</Button>
      {newButtons}
    </PageToolbar>
  )
}
