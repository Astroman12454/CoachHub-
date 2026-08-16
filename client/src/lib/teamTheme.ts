import type { TeamThemeColor } from "@shared/schema";

// A fixed, pre-vetted palette rather than a free-form color picker. Hue
// alone shifts perceived (relative) luminance a lot even at identical
// HSL lightness, so each preset's lightness was chosen per-hue to keep
// white text on the base/hover fill at WCAG AA (same bar client/src/index.css
// documents for the default orange) — verified via the e2e color-contrast
// scan (e2e/accessibility.spec.ts), not just eyeballed.
interface ThemePreset {
  base: string;
  hover: string;
  // accentDark is also reused for --ring, since a focus ring only needs to
  // be visible, not text-contrast-safe — no separate ring shade needed.
  accentLight: string;
  accentDark: string;
}

// The app's actual default brand orange (client/src/index.css's
// --basketball-orange) — hardcoded here rather than read from the CSS
// variable because that variable is exactly what applyTeamTheme overrides,
// so a "default" swatch styled with the `.basketball-orange` utility class
// would itself change color the moment any other team color gets applied
// (live, before the picker even closes) instead of always showing what
// "default" actually looks like.
export const DEFAULT_ORANGE = "hsl(16, 100%, 40%)";

export const TEAM_THEME_PRESETS: Record<TeamThemeColor, ThemePreset> = {
  blue: { base: "hsl(217, 91%, 40%)", hover: "hsl(217, 91%, 34%)", accentLight: "hsl(217, 91%, 40%)", accentDark: "hsl(217, 91%, 68%)" },
  green: { base: "hsl(142, 71%, 29%)", hover: "hsl(142, 71%, 24%)", accentLight: "hsl(142, 71%, 29%)", accentDark: "hsl(142, 60%, 55%)" },
  purple: { base: "hsl(271, 81%, 42%)", hover: "hsl(271, 81%, 36%)", accentLight: "hsl(271, 81%, 42%)", accentDark: "hsl(271, 81%, 72%)" },
  red: { base: "hsl(5, 74%, 42%)", hover: "hsl(5, 74%, 36%)", accentLight: "hsl(5, 74%, 42%)", accentDark: "hsl(5, 74%, 68%)" },
  teal: { base: "hsl(175, 84%, 24%)", hover: "hsl(175, 84%, 19%)", accentLight: "hsl(175, 84%, 24%)", accentDark: "hsl(175, 65%, 52%)" },
};

const OVERRIDE_VARS = ["--basketball-orange", "--basketball-orange-hover", "--basketball-orange-deep", "--basketball-orange-accent", "--primary", "--ring"] as const;

// Applies (or clears) a team's custom theme color by overriding the CSS
// custom properties every ".basketball-orange"/"bg-primary"/etc. utility
// reads from — see client/src/index.css. Inline styles on <html> win over
// both the light (:root) and dark (.dark) stylesheet rules, so this is the
// single place that needs to react to the active team or light/dark mode
// changing, instead of every component that happens to use the brand color.
export function applyTeamTheme(color: string | null | undefined, isDark: boolean) {
  const root = document.documentElement;
  const preset = color && color in TEAM_THEME_PRESETS ? TEAM_THEME_PRESETS[color as TeamThemeColor] : undefined;

  if (!preset) {
    for (const v of OVERRIDE_VARS) root.style.removeProperty(v);
    return;
  }

  const accent = isDark ? preset.accentDark : preset.accentLight;
  root.style.setProperty("--basketball-orange", preset.base);
  root.style.setProperty("--basketball-orange-hover", preset.hover);
  root.style.setProperty("--basketball-orange-deep", preset.hover);
  root.style.setProperty("--basketball-orange-accent", accent);
  root.style.setProperty("--primary", preset.base);
  root.style.setProperty("--ring", preset.accentDark);
}
