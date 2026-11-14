import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fmtNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardContent>
    </Card>
  )
}

/**
 * Cursor pagination bar. Cursors of previous pages are kept in a stack (in the URL), so
 * "back" is exact and every page is a cheap keyset query on the server.
 */
export function CursorPager({
  total,
  pageSize,
  pageSizes = [10, 25, 50, 100],
  page,
  hasNext,
  onNext,
  onPrev,
  onPageSize,
  loading,
}: {
  total?: number
  pageSize: number
  pageSizes?: number[]
  page: number
  hasNext: boolean
  onNext: () => void
  onPrev: () => void
  onPageSize: (size: number) => void
  loading?: boolean
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = total == null ? page * pageSize : Math.min(page * pageSize, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        {total == null ? "…" : `${fmtNumber(from)}–${fmtNumber(to)} из ${fmtNumber(total)}`}
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-muted-foreground sm:inline">На странице</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger size="sm" className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="tabular-nums">
          стр. {page}
        </Badge>
        <Button variant="outline" size="icon-sm" onClick={onPrev} disabled={page <= 1 || loading} aria-label="Назад">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={onNext} disabled={!hasNext || loading} aria-label="Вперёд">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

/** Clickable table header that cycles the sort of a field. */
export function SortHeader<F extends string>({
  field,
  label,
  sort,
  onSort,
  className,
}: {
  field: F
  label: string
  sort: { field: F; direction: "ASC" | "DESC" }
  onSort: (sort: { field: F; direction: "ASC" | "DESC" }) => void
  className?: string
}) {
  const active = sort.field === field
  const Icon = !active ? ArrowUpDown : sort.direction === "DESC" ? ArrowDown : ArrowUp
  return (
    <button
      type="button"
      className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground", className)}
      onClick={() => onSort({ field, direction: active && sort.direction === "DESC" ? "ASC" : "DESC" })}
    >
      {label}
      <Icon className="size-3.5" />
    </button>
  )
}

export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
