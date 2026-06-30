import React from 'react'

// BrowseLayout is the master-detail shell shared by the Browse pages
// (Decklists, Drafts, Players). It arranges three slots: a sticky filter
// header, a scrollable index rail, and a detail pane.
export function BrowseLayout({ filters, index, detail }) {
  return (
    <div className="browse-page">
      <div className="browse-filters">{filters}</div>
      <div className="browse-body">
        <div className="browse-index">{index}</div>
        <div className="browse-detail">{detail}</div>
      </div>
    </div>
  );
}

// BrowseEmptyState fills the detail pane before a record is selected.
export function BrowseEmptyState({ message }) {
  return <div className="browse-empty">{message}</div>;
}
