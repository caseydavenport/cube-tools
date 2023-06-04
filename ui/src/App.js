import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
// import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
// import {  Link } from "react-router-dom";
import DeckViewer from './DeckViewer'

// This is the main entrypoint into the app. Allows for navigation through widgets.
export default function Main() {
  return DeckViewer()
  //  return (
  //   <Router>
  //     <MainNav />
  //     <Routes>
  //       <Route path='/' exact component={StatsViewer} />
  //       <Route path='/decks' exact component={DeckViewer} />
  //     </Routes>
  //   </Router>
  // );
}

// StatsViewer displays stats spanning the selected drafts.
function StatsViewer() {
  return (
    <div>
      <img src="https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.peterlang.com%2Fdocument%2F1182554&psig=AOvVaw3wnfu2ynrW1BoDdfhz--YH&ust=1686004372830000&source=images&cd=vfe&ved=0CBAQjRxqFwoTCODm9e_Vqv8CFQAAAAAdAAAAABAI" />
    </div>
  )
}

// function MainNav() {
//   return (
//     <div className="main-nav">
//       <li><Link to="/" className="nav-button">Stats</Link></li>
//       <li><Link to="/decks" className="nav-button">Decks</Link></li>
//     </div>
//   )
// }
