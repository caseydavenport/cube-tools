import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ReactDOM from "react-dom/client";
import "./styles.css";
import App from "./App";


function component() {
  const element = document.createElement('div');

  // Create a root from the element.
  const root = ReactDOM.createRoot(element)

  // Render the application in the root.
  root.render(<App />)

  return element;
}

document.body.appendChild(component());
