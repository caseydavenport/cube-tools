import React, { useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Outlet, useSearchParams } from "react-router-dom";
import {DeckViewer} from './pages/DeckViewer.js'
import NavBar from './components/navbar.js'
import {StatsViewer} from './pages/Stats.js'
import { PlayersPage } from './pages/PlayersPage.js'
import { DraftsPage } from './pages/DraftsPage.js'
import { ExplorePage } from './pages/ExplorePage.js'
import { RemovalPage } from './pages/RemovalPage.js'
import {InitialDates} from './components/StatsUI.js'
import { useState } from "react";
import { CubeProvider } from './contexts/CubeContext.js';
import Landing from './pages/Landing.js';
import Overview from './pages/Overview.js';
import ImportHub from './pages/ImportHub.js';

import "./styles.css";

// hashParams reads the query string that follows the route in a HashRouter URL
// (e.g. "#/cube/decklists?match=...&start=..."). Used to seed initial filter
// state from a deep link.
function hashParams() {
  const h = window.location.hash || ""
  const i = h.indexOf("?")
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "")
}

// UrlStateSync keeps the date range and deck filter mirrored into the URL query
// string (within the hash route), so they survive a refresh and carry across
// in-app navigation. Uses replace so it doesn't spam browser history. Rendered
// inside the Router so useSearchParams is available.
function UrlStateSync({ startDate, endDate, matchStr }) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const cur = {
      start: searchParams.get("start") || "",
      end: searchParams.get("end") || "",
      match: searchParams.get("match") || "",
    };
    if (cur.start === (startDate || "") && cur.end === (endDate || "") && cur.match === (matchStr || "")) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    startDate ? next.set("start", startDate) : next.delete("start");
    endDate ? next.set("end", endDate) : next.delete("end");
    matchStr ? next.set("match", matchStr) : next.delete("match");
    setSearchParams(next, { replace: true });
  }, [startDate, endDate, matchStr, searchParams, setSearchParams]);
  return null;
}

// This is the main entrypoint into the app. Allows for navigation through widgets.
export default function Main() {
  ///////////////////////////////////////////////////////////////////////////////
  // State used for time selection.
  ///////////////////////////////////////////////////////////////////////////////
  // Seed the date range and deck filter from the URL hash query string, so a
  // deep link (e.g. "decks that mainboarded card X, same time range") opened in a
  // fresh tab reproduces those filters. Falls back to defaults when absent.
  const hashQuery = hashParams()
  let [start, end ] = InitialDates()
  const [startDate, setStartDate] = useState(hashQuery.get("start") || start);
  const [endDate, setEndDate] = useState(hashQuery.get("end") || end);
  function onStartSelected(event) {
    setStartDate(event.target.value)
  }
  function onEndSelected(event) {
    setEndDate(event.target.value)
  }

  // For matching decks and cards.
  const [matchStr, setMatchStr] = useState(hashQuery.get("match") || "");
  function onMatchUpdated(event) {
    setMatchStr(event.target.value)
  }

  const statsProps = {
    startDate,
    endDate,
    onStartSelected,
    onEndSelected,
    matchStr,
    onMatchUpdated,
  };

   return (
    <div>
    <Router>
      <NavBar />
      <UrlStateSync startDate={startDate} endDate={endDate} matchStr={matchStr} />
      <Routes>
        <Route path='/' element={<Landing />} />
        <Route path='/:cube' element={<CubeProvider><Outlet /></CubeProvider>}>
          <Route index element={<Overview />} />
          <Route path='cards' element={<StatsViewer view='cards' {...statsProps} />} />
          <Route path='colors' element={<StatsViewer view='colors' {...statsProps} />} />
          <Route path='explore' element={<ExplorePage {...statsProps} />} />
          <Route path='removal' element={<RemovalPage />} />
          <Route path='types' element={<StatsViewer view='types' {...statsProps} />} />
          <Route path='deckstats' element={<StatsViewer view='deckstats' {...statsProps} />} />
          <Route path='drafts' element={<DraftsPage {...statsProps} />} />
          <Route path='players' element={<PlayersPage {...statsProps} />} />
          <Route path='synergy' element={<StatsViewer view='synergy' {...statsProps} />} />
          <Route path='health' element={<StatsViewer view='health' {...statsProps} />} />
          <Route path='designmap' element={<StatsViewer view='designmap' {...statsProps} />} />
          <Route path='decklists' element={
            <DeckViewer
              startDate={startDate}
              endDate={endDate}
              onStartSelected={onStartSelected}
              onEndSelected={onEndSelected}
              matchStr={matchStr}
              onMatchUpdated={onMatchUpdated}
            />
          } />
          <Route path='import' element={<ImportHub />} />
          <Route path='import/:mode' element={<ImportHub />} />
        </Route>
      </Routes>
    </Router>
    </div>
  );
}
