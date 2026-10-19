import { createTheme } from "@mantine/core"
import { PRIMARY_SHADES, LIGHT, DARK, MANA } from "./tokens.js"

export const theme = createTheme({
  primaryColor: "sylvan",
  primaryShade: { light: 6, dark: 4 },
  colors: { sylvan: PRIMARY_SHADES },
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  defaultRadius: "md",
})

function schemeVars(t) {
  return {
    "--se-page": t.page,
    "--se-card": t.card,
    "--se-text": t.text,
    "--se-muted": t.muted,
    "--se-border": t.border,
    "--se-sidebar-from": t.sidebarFrom,
    "--se-sidebar-to": t.sidebarTo,
    "--se-good": t.good,
    "--se-bad": t.bad,
    "--mantine-color-body": t.page,
    "--mantine-color-text": t.text,
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
