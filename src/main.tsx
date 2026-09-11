import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./Detail.css";
import "./WorkingTree.css";
import "./Branches.css";
import "./GitInfoCache.css";
import "./WorkbenchTheme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
