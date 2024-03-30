import React from 'react';
import "./navbar.css"
import {  Link } from "react-router-dom";

const Navbar= () =>{
  return (
		<header className="header">
      <div className="mid">
		    <ul className="navbar">
		  	  <li><Link to="/stats">Stats</Link></li>
          <li><Link to="/decks">Decks</Link></li>
          <li><Link to="/dogs">Dogs</Link></li>
		    </ul>
      </div>
    </header>
  );
}
export default Navbar;
