import { createTheme } from "@mantine/core"
import { PRIMARY_SHADES, LIGHT, DARK, MANA } from "./tokens.js"

// theme is the Mantine theme: the "sylvan" violet scale as the primary color
// (a lighter shade in dark mode so it stays readable), the font, and corner radius.
export const theme = createTheme({
  primaryColor: "sylvan",
  primaryShade: { light: 6, dark: 4 },
  colors: { sylvan: PRIMARY_SHADES },
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  defaultRadius: "md",
})

// schemeVars turns one palette (LIGHT or DARK) into CSS variables. It also
// overrides Mantine's own body background and text colors so Mantine components
// and plain CSS pages use the same palette.
function schemeVars(palette) {
  return {
    "--se-page": palette.page,
    "--se-card": palette.card,
    "--se-text": palette.text,
    "--se-muted": palette.muted,
    "--se-border": palette.border,
    "--se-sidebar-from": palette.sidebarFrom,
    "--se-sidebar-to": palette.sidebarTo,
    "--se-good": palette.good,
    "--se-bad": palette.bad,
    "--mantine-color-body": palette.page,
    "--mantine-color-text": palette.text,
  }
}

// cssVariablesResolver publishes the tokens as --se-* variables so plain CSS,
// including the legacy bridge, can follow the active color scheme.
export function cssVariablesResolver() {
  return {
    variables: {
      "--se-mana-w": MANA.W,
      "--se-mana-u": MANA.U,
      "--se-mana-b": MANA.B,
      "--se-mana-r": MANA.R,
      "--se-mana-g": MANA.G,
    },
    light: schemeVars(LIGHT),
    dark: schemeVars(DARK),
  }
}
