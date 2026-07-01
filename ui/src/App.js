import React from 'react'
import { HashRouter as Router, Routes, Route, Outlet } from "react-router-dom";
import {DeckViewer} from './pages/DeckViewer.js'
import NavBar from './components/navbar.js'
import {StatsViewer} from './pages/Stats.js'
import { PlayersPage } from './pages/PlayersPage.js'
import { DraftsPage } from './pages/DraftsPage.js'
import {InitialDates} from './components/StatsUI.js'
import { useState } from "react";
import { CubeProvider } from './contexts/CubeContext.js';
import Landing from './pages/Landing.js';
import Overview from './pages/Overview.js';
import ImportHub from './pages/ImportHub.js';

import "./styles.css";

// This is the main entrypoint into the app. Allows for navigation through widgets.
export default function Main() {
  ///////////////////////////////////////////////////////////////////////////////
  // State used for time selection.
  ///////////////////////////////////////////////////////////////////////////////
  let [start, end ] = InitialDates()
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  function onStartSelected(event) {
    setStartDate(event.target.value)
  }
  function onEndSelected(event) {
    setEndDate(event.target.value)
  }

  // For matching decks and cards.
  const [matchStr, setMatchStr] = useState("");
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
      <Routes>
        <Route path='/' element={<Landing />} />
        <Route path='/:cube' element={<CubeProvider><Outlet /></CubeProvider>}>
          <Route index element={<Overview />} />
          <Route path='cards' element={<StatsViewer view='cards' {...statsProps} />} />
          <Route path='colors' element={<StatsViewer view='colors' {...statsProps} />} />
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
        </Route>
      </Routes>
    </Router>
    </div>
  );
}
