import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from "react-router-dom"
import { useStatsFilters, useStatsData } from "./StatsHooks.js"
import { useSelection } from "../hooks/useSelection.js"
import { useArrowNav } from "../hooks/useArrowNav.js"
import { BrowseLayout, BrowseEmptyState } from "../components/BrowseLayout.js"
import { DraftIndex, DraftPackBrowser, draftRows } from "./Drafts.js"
import { Button, DateSelector } from "../components/Dropdown.js"

// DraftsPage is the Browse > Drafts master-detail page: a list of drafts on the
// left, and the selected draft's pack-by-pack browser on the right.
export function DraftsPage(props) {
  const [refresh, setRefresh] = useState(1);
  const { cube } = useParams();
  const navigate = useNavigate();

  // Picking a draft collapses the index so the pack browser gets the screen;
  // the header toggles it back open.
  const [indexCollapsed, setIndexCollapsed] = useState(false);

  const filters = useStatsFilters();
  const dataProps = useMemo(() => ({
    startDate: props.startDate,
    endDate: props.endDate,
    matchStr: "",
  }), [props.startDate, props.endDate]);
  const data = useStatsData(filters, dataProps, refresh);
  const { drafts, parsed } = data;

  // Selected draft (by date), plus pack-browser sub-selections.
  const [selectedDraftLog, setSelectedDraftLog] = useSelection("draft");
  const [selectedDraftPlayer, setSelectedDraftPlayer] = useState("");
  const [draftPlayers, setDraftPlayers] = useState([]);
  const [draftPacks, setDraftPacks] = useState([]);
  const [selectedPack, setSelectedPack] = useState(1);

  // When a draft is selected (from the index or restored from the URL),
  // populate its player dropdown.
  useEffect(() => {
    let users = [{ label: "", value: "" }];
    for (let draft of Object.values(drafts || {})) {
      if (draft.date === selectedDraftLog) {
        for (let user of Object.values(draft.users)) {
          if (!user.isBot) users.push({ label: user.userID, value: user.userName });
        }
      }
    }
    setDraftPlayers(users);
    setSelectedDraftPlayer("");
    setDraftPacks([]);
    setSelectedPack(1);
  }, [selectedDraftLog, drafts]);

  const onDraftPlayerSelected = (event) => {
    setSelectedDraftPlayer(event.target.value);
    let numPicks = 0;
    for (let draft of Object.values(drafts || {})) {
      if (draft.date === selectedDraftLog) {
        for (let user of Object.values(draft.users)) {
          if (user.userName === event.target.value) {
            numPicks = user.picks.length;
            break;
          }
        }
        break;
      }
    }
    let pickOpts = [];
    for (let i = 1; i <= numPicks; i++) pickOpts.push({ label: i, value: i });
    setDraftPacks(pickOpts);
    setSelectedPack(1);
  };

  // The index rows in display order (date descending), plus the selected
  // draft's summary for the detail header.
  const rows = draftRows(drafts || {}, parsed.filteredDecks);
  const selectedSummary = rows.find((r) => r.date === selectedDraftLog) || null;

  // Left/right arrows step through the drafts in the index order.
  useArrowNav(rows, selectedDraftLog, (r) => r.date, (date) => setSelectedDraftLog(date));

  const browserProps = {
    drafts: drafts || {},
    draftPlayers,
    selectedPlayer: selectedDraftPlayer,
    onDraftPlayerSelected,
    draftPacks,
    selectedPack,
    onPackSelected: (e) => setSelectedPack(e.target.value),
    selectedDraftLog,
    summary: selectedSummary,
    // The index is the draft selector in Browse, so DraftPackWidgetOptions hides
    // its own Draft dropdown when handed a single-entry list.
    draftLogs: [{ label: selectedDraftLog, value: selectedDraftLog }],
    onDraftLogSelected: () => {},
  };

  const filterBar = (
    <div className="selector-group">
      <Button text="Refresh" onClick={() => setRefresh((r) => r + 1)} />
      <DateSelector label="From" id="from" value={props.startDate} onChange={props.onStartSelected} />
      <DateSelector label="To" id="to" value={props.endDate} onChange={props.onEndSelected} />
    </div>
  );

  return (
    <BrowseLayout
      stacked
      filters={filterBar}
      index={
        <DraftIndex
          drafts={drafts || {}}
          decks={parsed.filteredDecks}
          selected={selectedDraftLog}
          onSelect={(e) => { setSelectedDraftLog(e.currentTarget.id); setIndexCollapsed(true); }}
          collapsed={indexCollapsed}
          onToggleCollapse={() => setIndexCollapsed((c) => !c)}
          onSelectWinner={(name) => navigate(`/${cube}/players?player=${encodeURIComponent(name)}`)}
        />
      }
      detail={
        selectedDraftLog
          ? <DraftPackBrowser {...browserProps} />
          : <BrowseEmptyState message="Select a draft to browse its packs." />
      }
    />
  );
}
