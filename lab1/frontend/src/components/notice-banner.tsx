import { AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * Бэкенд после обработки формы делает редирект обратно и кладёт сообщение
 * в query-параметр `notice` или `error` — здесь мы его показываем.
 */
export function NoticeBanner({ notice, error }: { notice?: string; error?: string }) {
  if (!notice && !error) return null

  const isError = Boolean(error)
  const Icon = isError ? AlertCircle : CheckCircle2

  return (
    <div
      role="status"
      className={
        isError
          ? 'flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
          : 'flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success'
      }
    >
      <Icon className="size-4 shrink-0" />
      <span>{error ?? notice}</span>
    </div>
  )
}
