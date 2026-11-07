// Copyright (c) 2026 Tigera, Inc. All rights reserved.

import React from 'react';
import "./components.css";

// TabNav renders a page's strip of tabs: clicking one shows that tab's
// content. tabs is an array of { id, label }; active is the shown tab's id and
// onChange gets the clicked id.
export function TabNav({ tabs, active, onChange }) {
  // pick switches tabs without following the link's href.
  function pick(e, id) {
    e.preventDefault()
    onChange(id)
  }

  return (
    <nav className="section-nav" role="tablist">
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={`#${tab.id}`}
          role="tab"
          aria-selected={tab.id === active}
          className={tab.id === active ? "active" : ""}
          onClick={(e) => pick(e, tab.id)}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  )
}

// TabbedPanel is a card showing one of several views of the same data, such
// as a table's column sets. Its tabs sit on the card's top edge, set apart
// from the page's TabNav, with the view's actions (a count, a link) on the
// right. tabs is an array of { value, label }.
export function TabbedPanel({ label, tabs, active, onChange, actions, children }) {
  let right = null
  if (actions) {
    right = <div className="tabbed-panel-actions">{actions}</div>
  }

  return (
    <div className="tabbed-panel">
      <div className="tabbed-panel-head">
        <div className="tabbed-panel-tabs" role="tablist" aria-label={label}>
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={tab.value === active}
              className={tab.value === active ? "active" : ""}
              onClick={() => onChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}
