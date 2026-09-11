import { useEffect, useState, type ReactNode } from "react";
import { ACCENT_COLORS, useAppSettings, type AccentColor, type UiDensity } from "./appSettings";
import { useI18n, type Language } from "./i18n";
import { useTheme, type ThemeMode } from "./theme";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type SettingsSection = "general" | "appearance";

const COPY = {
  "zh-CN": {
    title: "设置",
    general: "常规",
    appearance: "外观",
    language: "语言",
    languageDescription: "选择应用界面语言。",
    chinese: "简体中文",
    english: "English",
    theme: "主题",
    themeDescription: "选择应用的浅色或深色外观。",
    light: "浅色",
    dark: "深色",
    uiFontSize: "界面字号",
    uiFontDescription: "调整工具栏、列表、按钮和普通文本的字号。",
    monoFontSize: "等宽字号",
    monoFontDescription: "调整 Diff、路径、Commit Hash 等等宽文本字号。",
    density: "界面密度",
    densityDescription: "控制列表行高、工具栏和控件的垂直间距。",
    compact: "紧凑",
    comfortable: "标准",
    spacious: "宽松",
    accent: "强调色",
    accentDescription: "用于选中状态、活动标签和主要操作的界面颜色。",
    blue: "蓝色",
    purple: "紫色",
    green: "绿色",
    orange: "橙色",
    rose: "玫红",
    reset: "恢复外观默认值",
    close: "关闭",
    immediate: "更改会立即应用并自动保存。",
  },
  "en-US": {
    title: "Settings",
    general: "General",
    appearance: "Appearance",
    language: "Language",
    languageDescription: "Choose the application interface language.",
    chinese: "简体中文",
    english: "English",
    theme: "Theme",
    themeDescription: "Choose the light or dark application appearance.",
    light: "Light",
    dark: "Dark",
    uiFontSize: "UI font size",
    uiFontDescription: "Adjust the font size used by toolbars, lists, buttons and general text.",
    monoFontSize: "Monospace font size",
    monoFontDescription: "Adjust the font size used by diffs, paths and commit hashes.",
    density: "UI density",
    densityDescription: "Control row heights and vertical spacing in toolbars and controls.",
    compact: "Compact",
    comfortable: "Default",
    spacious: "Spacious",
    accent: "Accent color",
    accentDescription: "Used for selections, active tabs and primary actions.",
    blue: "Blue",
    purple: "Purple",
    green: "Green",
    orange: "Orange",
    rose: "Rose",
    reset: "Restore appearance defaults",
    close: "Close",
    immediate: "Changes are applied immediately and saved automatically.",
  },
} as const;

const ACCENT_ORDER: AccentColor[] = ["blue", "purple", "green", "orange", "rose"];
const DENSITIES: UiDensity[] = ["compact", "comfortable", "spacious"];

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings, resetAppearance } = useAppSettings();
  const [section, setSection] = useState<SettingsSection>("general");
  const copy = COPY[language];

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="application-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="application-settings-header">
          <strong>{copy.title}</strong>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label={copy.close}>
            ×
          </button>
        </header>

        <div className="application-settings-body">
          <nav className="settings-sections" aria-label={copy.title}>
            <button
              type="button"
              className={section === "general" ? "active" : ""}
              onClick={() => setSection("general")}
            >
              {copy.general}
            </button>
            <button
              type="button"
              className={section === "appearance" ? "active" : ""}
              onClick={() => setSection("appearance")}
            >
              {copy.appearance}
            </button>
          </nav>

          <div className="settings-content">
            {section === "general" ? (
              <>
                <div className="settings-page-heading">
                  <h2>{copy.general}</h2>
                  <span>{copy.immediate}</span>
                </div>

                <SettingRow title={copy.language} description={copy.languageDescription}>
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.currentTarget.value as Language)}
                  >
                    <option value="zh-CN">{copy.chinese}</option>
                    <option value="en-US">{copy.english}</option>
                  </select>
                </SettingRow>

                <SettingRow title={copy.theme} description={copy.themeDescription}>
                  <SegmentedControl<ThemeMode>
                    value={theme}
                    items={[
                      ["light", copy.light],
                      ["dark", copy.dark],
                    ]}
                    onChange={setTheme}
                  />
                </SettingRow>
              </>
            ) : (
              <>
                <div className="settings-page-heading">
                  <h2>{copy.appearance}</h2>
                  <span>{copy.immediate}</span>
                </div>

                <SettingRow title={copy.uiFontSize} description={copy.uiFontDescription}>
                  <FontSizeControl
                    value={settings.uiFontSize}
                    min={11}
                    max={17}
                    onChange={(uiFontSize) => updateSettings({ uiFontSize })}
                  />
                </SettingRow>

                <SettingRow title={copy.monoFontSize} description={copy.monoFontDescription}>
                  <FontSizeControl
                    value={settings.monoFontSize}
                    min={9}
                    max={16}
                    onChange={(monoFontSize) => updateSettings({ monoFontSize })}
                  />
                </SettingRow>

                <SettingRow title={copy.density} description={copy.densityDescription}>
                  <SegmentedControl<UiDensity>
                    value={settings.density}
                    items={DENSITIES.map(
                      (density): readonly [UiDensity, string] => [density, copy[density]],
                    )}
                    onChange={(density) => updateSettings({ density })}
                  />
                </SettingRow>

                <SettingRow title={copy.accent} description={copy.accentDescription}>
                  <div className="accent-options">
                    {ACCENT_ORDER.map((accent) => (
                      <button
                        type="button"
                        key={accent}
                        className={`accent-option${settings.accentColor === accent ? " active" : ""}`}
                        onClick={() => updateSettings({ accentColor: accent })}
                        title={copy[accent]}
                        aria-label={copy[accent]}
                        aria-pressed={settings.accentColor === accent}
                      >
                        <span style={{ background: ACCENT_COLORS[accent].value }} />
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <div className="settings-reset-row">
                  <button type="button" className="secondary-button" onClick={resetAppearance}>
                    {copy.reset}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function FontSizeControl({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="font-size-control">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span>{value}px</span>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: Array<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-segmented">
      {items.map(([itemValue, label]) => (
        <button
          type="button"
          key={itemValue}
          className={value === itemValue ? "active" : ""}
          onClick={() => onChange(itemValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
