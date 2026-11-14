import { useCallback, useSyncExternalStore } from "react"

type Theme = "light" | "dark"

function subscribe(cb: () => void) {
  const observer = new MutationObserver(cb)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

const read = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light")

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme)
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark")
    try {
      localStorage.setItem("theme", next)
    } catch {
      // storage unavailable (private mode) — theme still applies for this session
    }
  }, [])
  return { theme, setTheme }
}
