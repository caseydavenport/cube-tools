import React from 'react';
import "./navbar.css"
import { NavLink } from "react-router-dom";

const Navbar= () =>{
  return (
		<header className="header">
      <div className="mid">
		    <ul className="navbar">
		  	  <li><NavLink to="/stats" className={({ isActive }) => isActive ? "active" : ""}>Stats</NavLink></li>
          <li><NavLink to="/decks" className={({ isActive }) => isActive ? "active" : ""}>Decks</NavLink></li>
          <li><NavLink to="/dogs" className={({ isActive }) => isActive ? "active" : ""}>Dogs</NavLink></li>
		    </ul>
      </div>
    </header>
  );
}
export default Navbar;
