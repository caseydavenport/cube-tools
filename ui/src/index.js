import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ReactDOM from "react-dom";
import "./styles.css";
import App from "./App";


function component() {
  const element = document.createElement('div');
  // element.innerHTML = _.join(['Hello', 'webpack'], ' ');
  ReactDOM.render(<App />, element)
  return element;
}

document.body.appendChild(component());
