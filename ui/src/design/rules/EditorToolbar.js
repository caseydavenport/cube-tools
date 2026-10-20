// The Rules editor's toolbar and its view switch.

import React from 'react'
import { SegmentedControl } from '@mantine/core'
import { PageToolbar } from '../../toolbar/PageToolbar.js'
import { RULES_COPY } from "./copy.js"

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
  let auditLabel = RULES_COPY.toolbar.audit
  if (auditCount > 0) {
    auditLabel = <span className="de-view-label">{RULES_COPY.toolbar.audit}<span className="de-badge-warn">{auditCount}</span></span>
  }

  const views = [
    { value: 'overview', label: RULES_COPY.toolbar.overview },
    { value: 'audit', label: auditLabel },
    { value: 'review', label: RULES_COPY.toolbar.review },
    { value: 'compare', label: RULES_COPY.toolbar.compare, disabled: !compareReady },
  ]

  function onChange(value) {
    if (value === 'overview') {
      onSelectView('')
    } else {
      onSelectView(value)
    }
  }

  return (
    <PageToolbar title={RULES_COPY.toolbar.title}>
      <SegmentedControl size="xs" aria-label={RULES_COPY.toolbar.viewsLabel} data={views} value={toolbarValue(view)} onChange={onChange} />
    </PageToolbar>
  )
}
