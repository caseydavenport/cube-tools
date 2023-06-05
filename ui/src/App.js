import React from 'react'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import DeckViewer from './DeckViewer'
import NavBar from './components/navbar.js'
import Dogs from './pages/Dogs.js'
import StatsViewer from './pages/Stats.js'

// This is the main entrypoint into the app. Allows for navigation through widgets.
export default function Main() {
  // return DeckViewer()
   return (
    <Router>
      <NavBar />
      <Routes>
        <Route path='/' exact element={<StatsViewer />} />
        <Route path='/decks' element={<DeckViewer />} />
        <Route path='/dogs' element={<Dogs />} />
      </Routes>
    </Router>
  );
}
