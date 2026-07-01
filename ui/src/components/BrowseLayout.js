import React, { useEffect } from 'react'

// BrowseLayout is the master-detail shell shared by the Browse pages
// (Decklists, Drafts, Players). It arranges three slots: a sticky filter
// header, a scrollable index rail, and a detail pane.
//
// By default the index and detail sit side by side. Pass stacked to put the
// index full-width on top and the detail full-width below - used by Decklists,
// whose detail (the card columns by mana value) needs the whole page width.
export function BrowseLayout({ filters, index, detail, stacked }) {
  return (
    <div className={"browse-page" + (stacked ? " browse-stacked" : "")}>
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

// CollapsibleIndex wraps a Browse index list (a table) in a sticky header bar
// that slides the list open/closed. Picking a record collapses it so the detail
// gets the screen; clicking the header toggles it. Pass selectedRef pointing at
// the selected row so re-opening scrolls it back into view rather than snapping
// to the top.
export function CollapsibleIndex({ title, collapsed, onToggleCollapse, selectedRef, children }) {
  useEffect(() => {
    if (collapsed || !selectedRef || !selectedRef.current) {
      return;
    }
    // Wait for the slide to finish, then re-center the selected row.
    const t = setTimeout(() => {
      selectedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 480);
    return () => clearTimeout(t);
  }, [collapsed]);

  return (
    <div className="filtered-decks">
      <div className="decklist-index-header" onClick={onToggleCollapse}>
        <span className="caret">{collapsed ? "▸" : "▾"}</span>{title}
      </div>
      <div className={"decklist-index-body" + (collapsed ? " collapsed" : "")}>
        <div className="decklist-index-body-inner">{children}</div>
      </div>
    </div>
  );
}
