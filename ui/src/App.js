import React from 'react'
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import {DeckViewer} from './pages/DeckViewer.js'
import NavBar from './components/navbar.js'
import Dogs from './pages/Dogs.js'
import {StatsViewer, InitialDates} from './pages/Stats.js'
import { useState } from "react";

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

  let stats = StatsViewer({
    startDate: startDate,
    endDate: endDate,
    onStartSelected: onStartSelected,
    onEndSelected: onEndSelected
  })

  let decks = DeckViewer({
    startDate: startDate,
    endDate: endDate,
    onStartSelected: onStartSelected,
    onEndSelected: onEndSelected
  })

   return (
    <div>
    <Router>
      <NavBar />
      <Routes>
        <Route path='/stats' element={stats} />
        <Route path='/decks' element={decks} />
        <Route path='/dogs' element={<Dogs />} />
      </Routes>
    </Router>
    </div>
  );
}
