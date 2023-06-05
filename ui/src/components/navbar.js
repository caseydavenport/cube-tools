import React from 'react';
import "./navbar.css"
import {  Link } from "react-router-dom";
const Navbar= () =>{
  return (
		<header class="header">
      <div class="mid">
		    <ul class="navbar">
		  	  <li><Link to="/">Stats</Link></li>
          <li><Link to="/decks">Decks</Link></li>
          <li><Link to="/dogs">Dogs</Link></li>
		    </ul>
      </div>
    </header>
  );
}
export default Navbar;
