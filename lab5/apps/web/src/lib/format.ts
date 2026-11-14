const nf = new Intl.NumberFormat("ru-RU")
const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 })
const dtf = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
const df = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "UTC" })

export const fmtNumber = (v: number | null | undefined) => (v == null ? "—" : nf.format(v))
export const fmtCompact = (v: number | null | undefined) => (v == null ? "—" : compact.format(v))
export const fmtFixed = (v: number | null | undefined, digits = 1) => (v == null ? "—" : v.toFixed(digits))
export const fmtDateTime = (v: string | null | undefined) => (v ? `${dtf.format(new Date(v))} UTC` : "—")
export const fmtDate = (v: string | null | undefined) => (v ? df.format(new Date(v)) : "—")

export function fmtRelative(v: string | null | undefined) {
  if (!v) return "—"
  const diff = (Date.now() - new Date(v).getTime()) / 1000
  if (diff < 60) return "только что"
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  return `${Math.floor(diff / 86400)} дн назад`
}

export function fmtDuration(ms: number | null | undefined) {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms} мс`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} с`
  return `${Math.floor(ms / 60_000)} мин ${Math.round((ms % 60_000) / 1000)} с`
}

export const magnitudeColor = (m: number | null | undefined) => {
  const v = m ?? 0
  if (v >= 7) return "#dc2626"
  if (v >= 6) return "#ea580c"
  if (v >= 5) return "#f59e0b"
  if (v >= 4) return "#eab308"
  return "#22c55e"
}
