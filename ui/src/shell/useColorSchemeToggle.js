import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core"
import { IconMoon, IconSun } from "@tabler/icons-react"

// useColorSchemeToggle gives the light/dark switch everything it shows: the
// toggle function, and the label and icon for the mode the switch would change
// to. Shared by the sidebar and the welcome page.
export function useColorSchemeToggle() {
  const { toggleColorScheme } = useMantineColorScheme()
  const isDark = useComputedColorScheme("light") === "dark"

  if (isDark) {
    return { toggle: toggleColorScheme, label: "Light mode", Icon: IconSun }
  }
  return { toggle: toggleColorScheme, label: "Dark mode", Icon: IconMoon }
}
