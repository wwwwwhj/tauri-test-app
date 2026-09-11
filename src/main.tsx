import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import "./Detail.css";
import "./WorkingTree.css";
import "./Branches.css";
import "./GitInfoCache.css";
import "./WorkbenchTheme.css";
import "./WorkbenchPolish.css";
import "./UiPreferences.css";
import "./ThemeMode.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
