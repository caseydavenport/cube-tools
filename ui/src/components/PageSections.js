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
