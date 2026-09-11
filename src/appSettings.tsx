import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UiDensity = "compact" | "comfortable" | "spacious";
export type AccentColor = "blue" | "purple" | "green" | "orange" | "rose";

export interface ApplicationSettings {
  uiFontSize: number;
  monoFontSize: number;
  density: UiDensity;
  accentColor: AccentColor;
  logShowAuthorEmail: boolean;
  diffWrapLines: boolean;
  diffShowLineNumbers: boolean;
}

const STORAGE_KEY = "git-workbench.application-settings.v1";

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = {
  uiFontSize: 13,
  monoFontSize: 11,
  density: "compact",
  accentColor: "blue",
  logShowAuthorEmail: true,
  diffWrapLines: false,
  diffShowLineNumbers: true,
};

export const ACCENT_COLORS: Record<AccentColor, { value: string; hover: string }> = {
  blue: { value: "#3574f0", hover: "#2f65d2" },
  purple: { value: "#7c5ce7", hover: "#694bd0" },
  green: { value: "#3d8b5f", hover: "#347750" },
  orange: { value: "#c8792b", hover: "#ae6722" },
  rose: { value: "#c95575", hover: "#ae4663" },
};

interface AppSettingsContextValue {
  settings: ApplicationSettings;
  updateSettings: (patch: Partial<ApplicationSettings>) => void;
  resetAppearance: () => void;
  resetAll: () => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readInitialSettings(): ApplicationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPLICATION_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ApplicationSettings>;

    const density: UiDensity =
      parsed.density === "comfortable" || parsed.density === "spacious"
        ? parsed.density
        : "compact";
    const accentColor: AccentColor =
      parsed.accentColor && parsed.accentColor in ACCENT_COLORS
        ? (parsed.accentColor as AccentColor)
        : "blue";

    return {
      uiFontSize: clampNumber(parsed.uiFontSize, 11, 17, DEFAULT_APPLICATION_SETTINGS.uiFontSize),
      monoFontSize: clampNumber(parsed.monoFontSize, 9, 16, DEFAULT_APPLICATION_SETTINGS.monoFontSize),
      density,
      accentColor,
      logShowAuthorEmail: readBoolean(
        parsed.logShowAuthorEmail,
        DEFAULT_APPLICATION_SETTINGS.logShowAuthorEmail,
      ),
      diffWrapLines: readBoolean(parsed.diffWrapLines, DEFAULT_APPLICATION_SETTINGS.diffWrapLines),
      diffShowLineNumbers: readBoolean(
        parsed.diffShowLineNumbers,
        DEFAULT_APPLICATION_SETTINGS.diffShowLineNumbers,
      ),
    };
  } catch {
    return DEFAULT_APPLICATION_SETTINGS;
  }
}

function applySettings(settings: ApplicationSettings) {
  const root = document.documentElement;
  const accent = ACCENT_COLORS[settings.accentColor];

  root.style.setProperty("--app-ui-font-size", `${settings.uiFontSize}px`);
  root.style.setProperty("--app-mono-font-size", `${settings.monoFontSize}px`);
  root.style.setProperty("--wb-accent", accent.value);
  root.style.setProperty("--wb-accent-hover", accent.hover);
  root.style.setProperty(
    "--wb-accent-soft",
    `color-mix(in srgb, ${accent.value} 16%, transparent)`,
  );
  root.style.setProperty(
    "--wb-selected",
    `color-mix(in srgb, ${accent.value} 16%, var(--wb-panel))`,
  );
  root.style.setProperty(
    "--wb-selected-strong",
    `color-mix(in srgb, ${accent.value} 24%, var(--wb-panel))`,
  );
  root.dataset.density = settings.density;
  root.dataset.logAuthorEmail = settings.logShowAuthorEmail ? "show" : "hide";
  root.dataset.diffWrap = settings.diffWrapLines ? "wrap" : "nowrap";
  root.dataset.diffLineNumbers = settings.diffShowLineNumbers ? "show" : "hide";
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ApplicationSettings>(readInitialSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applySettings(settings);
  }, [settings]);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      settings,
      updateSettings: (patch) => setSettings((current) => ({ ...current, ...patch })),
      resetAppearance: () => setSettings((current) => ({
        ...current,
        uiFontSize: DEFAULT_APPLICATION_SETTINGS.uiFontSize,
        monoFontSize: DEFAULT_APPLICATION_SETTINGS.monoFontSize,
        density: DEFAULT_APPLICATION_SETTINGS.density,
        accentColor: DEFAULT_APPLICATION_SETTINGS.accentColor,
      })),
      resetAll: () => setSettings(DEFAULT_APPLICATION_SETTINGS),
    }),
    [settings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) throw new Error("useAppSettings must be used inside AppSettingsProvider");
  return context;
}
