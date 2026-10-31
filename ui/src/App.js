import React, { useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { DecksPage } from './pages/DecksPage.js'
import {StatsViewer} from './pages/Stats.js'
import { PlayersPage } from './pages/PlayersPage.js'
import { CardPage } from './cards/CardPage.js'
import { DraftsPage } from './pages/DraftsPage.js'
import { ExplorePage } from './pages/ExplorePage.js'
import { RemovalPage } from './pages/RemovalPage.js'
import { Packages } from './pages/Packages.js'
import { DesignEditorPage } from './design/rules/RulesEditorPage.js'
import { initialDates, todayString } from './toolbar/dateRanges.js'
import { useState } from "react";
import { CubeProvider } from './contexts/CubeContext.js';
import Welcome from './pages/Welcome.js';
import CubeHome from './pages/CubeHome.js';
import ImportHub from './pages/ImportHub.js';
import NotFound from './pages/NotFound.js';
import { AppLayout } from './shell/AppLayout.js';
import { changePage, followLink, linkFilterStart, typeFilter } from './shell/linkFilter.js';
import { pageSegment } from './shell/paths.js';
import { MantineProvider } from "@mantine/core";
import { theme, cssVariablesResolver } from "./theme/theme.js";

import "./theme/base.css";
import "./styles.css";

// hashParams reads the query string that follows the route in a HashRouter URL
// (e.g. "#/cube/decks?match=...&start=..."). Used to seed initial filter
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
  let [start, end ] = initialDates(todayString())
  const [startDate, setStartDate] = useState(hashQuery.get("start") || start);
  const [endDate, setEndDate] = useState(hashQuery.get("end") || end);
  function onStartSelected(event) {
    setStartDate(event.target.value)
  }
  function onEndSelected(event) {
    setEndDate(event.target.value)
  }

  // onRangeChange sets both ends of the date range at once, for the page
  // toolbar's date range menu.
  function onRangeChange(start, end) {
    setStartDate(start)
    setEndDate(end)
  }

  const dateProps = {
    startDate,
    endDate,
    onStartSelected,
    onEndSelected,
    onRangeChange,
  };

   return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
    <div>
    <Router>
      <AppRoutes dateProps={dateProps} initialMatch={hashQuery.get("match") || ""} />
    </Router>
    </div>
    </MantineProvider>
  );
}

// AppRoutes holds the deck filter and renders the routes. It sits inside the
// Router so it sees page changes while rendering: a filter a link set is put
// back before the next page reads it, since pages copy the filter on load.
function AppRoutes({ dateProps, initialMatch }) {
  const page = pageSegment(useLocation().pathname)
  const [filter, setFilter] = useState(() => linkFilterStart(initialMatch))
  const [lastPage, setLastPage] = useState(page)
  if (page !== lastPage) {
    setLastPage(page)
    setFilter(changePage(filter, page))
  }

  // onMatchUpdated sets a filter the user typed, which stays across pages.
  function onMatchUpdated(event) {
    const typed = event.target.value
    setFilter(current => typeFilter(current, typed))
  }

  // onLinkMatch sets a link's filter as it's followed. Leaving the page the
  // link opened restores the filter from before.
  function onLinkMatch(match) {
    setFilter(current => followLink(current, match, page))
  }

  const matchStr = filter.match
  const statsProps = { ...dateProps, matchStr, onMatchUpdated, onLinkMatch };

  return (
    <>
      <UrlStateSync startDate={dateProps.startDate} endDate={dateProps.endDate} matchStr={matchStr} />
      <Routes>
        <Route path='/' element={<Welcome />} />
        <Route path='/:cube' element={<CubeProvider><AppLayout><Outlet /></AppLayout></CubeProvider>}>
          <Route index element={<CubeHome />} />
          <Route path='cards' element={<StatsViewer view='cards' {...statsProps} />} />
          <Route path='cards/:name' element={<CardPage {...statsProps} />} />
          <Route path='colors' element={<StatsViewer view='colors' {...statsProps} />} />
          <Route path='charts' element={<ExplorePage {...statsProps} />} />
          <Route path='removal' element={<RemovalPage {...statsProps} />} />
          <Route path='packages' element={<Packages {...statsProps} />} />
          <Route path='archetypes' element={<StatsViewer view='types' {...statsProps} />} />
          <Route path='deck-stats' element={<StatsViewer view='deckstats' {...statsProps} />} />
          <Route path='drafts' element={<DraftsPage {...statsProps} />} />
          <Route path='players' element={<PlayersPage {...statsProps} />} />
          <Route path='synergy' element={<StatsViewer view='synergy' {...statsProps} />} />
          <Route path='health' element={<StatsViewer view='health' {...statsProps} />} />
          <Route path='synergy-map' element={<StatsViewer view='designmap' {...statsProps} />} />
          <Route path='rules-editor' element={<DesignEditorPage />} />
          <Route path='decks' element={<DecksPage {...statsProps} />} />
          <Route path='import' element={<ImportHub />} />
          <Route path='import/:mode' element={<ImportHub />} />
          <Route path='*' element={<NotFound />} />
        </Route>
        <Route path='*' element={<NotFound />} />
      </Routes>
    </>
  );
}
