import { Badge } from "@/components/ui/badge"
import { fmtFixed, magnitudeColor } from "@/lib/format"

export const SEVERITY_LABELS: Record<string, string> = {
  MICRO: "Микро",
  MINOR: "Слабое",
  LIGHT: "Лёгкое",
  MODERATE: "Умеренное",
  STRONG: "Сильное",
  MAJOR: "Мощное",
  GREAT: "Катастрофическое",
}

export const ALERT_LABELS: Record<string, string> = { GREEN: "Зелёный", YELLOW: "Жёлтый", ORANGE: "Оранжевый", RED: "Красный" }

export function MagnitudeBadge({ value }: { value: number | null | undefined }) {
  return (
    <span
      className="inline-flex min-w-11 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold text-white tabular-nums"
      style={{ backgroundColor: magnitudeColor(value) }}
    >
      M{fmtFixed(value)}
    </span>
  )
}

export function AlertBadge({ level }: { level: string | null | undefined }) {
  if (!level) return null
  const colors: Record<string, string> = {
    GREEN: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    YELLOW: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    ORANGE: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    RED: "bg-red-500/15 text-red-600 dark:text-red-400",
  }
  return (
    <Badge variant="outline" className={colors[level]}>
      PAGER: {ALERT_LABELS[level] ?? level}
    </Badge>
  )
}
