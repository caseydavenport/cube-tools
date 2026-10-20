// The Rules editor's toolbar and its view switch, and the page's copy.

import React from 'react'
import { SegmentedControl } from '@mantine/core'
import { PageToolbar } from '../../toolbar/PageToolbar.js'

// COPY holds the text this page adds in the toolbar and read-only notice.
// Placeholders for Casey to replace.
export const COPY = {
  title: 'Rules editor',
  readOnly: 'This cube is read-only',
  viewsLabel: 'Rules editor view',
  overview: 'Overview',
  audit: 'Audit',
  review: 'Review',
  compare: 'Compare',
}

// TOOLBAR_VIEWS are the view= values the toolbar switches between. Overview is
// the empty value; the control needs a non-empty one, so it uses 'overview'.
const TOOLBAR_VIEWS = ['audit', 'review', 'compare']

// toolbarValue maps the view= parameter to the toolbar segment it lights up.
// Group and link views ('g:…', 'l:…') light up none, so it returns null.
function toolbarValue(view) {
  if (view === '') {
    return 'overview'
  }
  if (TOOLBAR_VIEWS.includes(view)) {
    return view
  }
  return null
}

// EditorToolbar is the page toolbar: the title and a switch between the
// rulebook-wide views. Compare needs two cards picked in the card lens, and
// Audit carries a count of structural issues when there are any.
export function EditorToolbar({ view, auditCount, compareReady, onSelectView }) {
  let auditLabel = COPY.audit
  if (auditCount > 0) {
    auditLabel = <span className="de-view-label">{COPY.audit}<span className="de-badge-warn">{auditCount}</span></span>
  }

  const views = [
    { value: 'overview', label: COPY.overview },
    { value: 'audit', label: auditLabel },
    { value: 'review', label: COPY.review },
    { value: 'compare', label: COPY.compare, disabled: !compareReady },
  ]

  function onChange(value) {
    if (value === 'overview') {
      onSelectView('')
    } else {
      onSelectView(value)
    }
  }

  return (
    <PageToolbar title={COPY.title}>
      <SegmentedControl size="xs" aria-label={COPY.viewsLabel} data={views} value={toolbarValue(view)} onChange={onChange} />
    </PageToolbar>
  )
}
