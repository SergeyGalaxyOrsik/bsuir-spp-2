/** Stable colors for NASA EONET categories, shared by maps and badges. */
export const CATEGORY_COLORS: Record<string, string> = {
  wildfires: "#f97316",
  severeStorms: "#3b82f6",
  volcanoes: "#dc2626",
  seaLakeIce: "#06b6d4",
  floods: "#0ea5e9",
  earthquakes: "#a855f7",
  drought: "#ca8a04",
  dustHaze: "#a16207",
  landslides: "#78716c",
  manmade: "#64748b",
  snow: "#e2e8f0",
  tempExtremes: "#ef4444",
  waterColor: "#14b8a6",
}

export const categoryColor = (id: string) => CATEGORY_COLORS[id] ?? "#22c55e"
