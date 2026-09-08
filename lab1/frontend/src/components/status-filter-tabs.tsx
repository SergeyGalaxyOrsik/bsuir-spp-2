import { Link } from '@tanstack/react-router'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { STATUS_FILTERS, type StatusFilter, type TaskStats } from '#/lib/api'
import { FILTER_LABELS } from '#/lib/format'

/**
 * Фильтр по статусу. Каждая вкладка — обычная ссылка, поэтому фильтрация
 * работает и без JavaScript: сервер отдаёт уже отфильтрованную разметку.
 */
export function StatusFilterTabs({
  value,
  stats,
  query,
}: {
  value: StatusFilter
  stats: TaskStats
  query: string
}) {
  return (
    <Tabs value={value} className="w-full">
      <TabsList variant="line" className="flex h-auto w-full flex-wrap justify-start gap-1">
        {STATUS_FILTERS.map((filter) => (
          <TabsTrigger
            key={filter}
            value={filter}
            className="flex-none gap-2 px-3 py-1.5 data-active:bg-background data-active:text-foreground data-active:shadow-xs"
            render={
              <Link
                to="/"
                search={{ status: filter, q: query || undefined }}
                aria-current={value === filter ? 'page' : undefined}
              />
            }
          >
            <span>{FILTER_LABELS[filter]}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
              {stats[filter]}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
