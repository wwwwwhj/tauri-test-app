import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppSettingsProvider } from "./appSettings";
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
import "./ThemeLightFix.css";
import "./SettingsDialog.css";
import "./AppSettings.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AppSettingsProvider>
          <App />
        </AppSettingsProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
