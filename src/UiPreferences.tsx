import { useState } from "react";
import SettingsDialog from "./SettingsDialog";
import { useI18n } from "./i18n";
import { useTheme } from "./theme";

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.7" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1.3v1.5M8 13.2v1.5M1.3 8h1.5M13.2 8h1.5M3.27 3.27l1.06 1.06M11.67 11.67l1.06 1.06M12.73 3.27l-1.06 1.06M4.33 11.67l-1.06 1.06" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M12.8 10.15A5.45 5.45 0 0 1 5.85 3.2 5.5 5.5 0 1 0 12.8 10.15Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1.7v1.2M8 13.1v1.2M14.3 8h-1.2M2.9 8H1.7M12.45 3.55l-.85.85M4.4 11.6l-.85.85M12.45 12.45l-.85-.85M4.4 4.4l-.85-.85" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="8" r="5.1" stroke="currentColor" strokeWidth="1" opacity=".45" />
    </svg>
  );
}

export default function UiPreferences() {
  const { language, toggleLanguage, t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const languageTitle = language === "zh-CN"
    ? t("preferences.switchToEnglish")
    : t("preferences.switchToChinese");
  const themeTitle = theme === "dark"
    ? t("preferences.lightMode")
    : t("preferences.darkMode");
  const settingsTitle = language === "zh-CN" ? "设置" : "Settings";

  return (
    <>
      <div className="ui-preferences" aria-label={t("preferences.language")}>
        <button
          type="button"
          className="ui-preference-button language-toggle"
          onClick={toggleLanguage}
          title={languageTitle}
          aria-label={languageTitle}
        >
          {language === "zh-CN" ? "中" : "EN"}
        </button>
        <button
          type="button"
          className="ui-preference-button theme-toggle"
          onClick={toggleTheme}
          title={themeTitle}
          aria-label={themeTitle}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className="ui-preference-button settings-toggle"
          onClick={() => setSettingsOpen(true)}
          title={settingsTitle}
          aria-label={settingsTitle}
        >
          <SettingsIcon />
        </button>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
