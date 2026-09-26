// ==================================================================
// FILE TYPE : APP ENTRY POINT
// PURPOSE   :
//   Vite/React entry point — mounts <App /> (frontend/App.jsx) into #root
//   and loads the global stylesheet.
// ==================================================================
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./frontend/App";
import "./frontend/styles/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
