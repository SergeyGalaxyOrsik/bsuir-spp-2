import type { StatusFilter, TaskStatus } from './api'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Выполнено',
}

export const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Все',
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Выполнено',
  overdue: 'Просрочены',
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: string | null): string {
  if (!value) return '—'
  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return dateTimeFormatter.format(new Date(value))
}

/** Сколько дней осталось до срока: отрицательное значение — просрочка. */
export function daysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

export function formatDeadlineHint(dueDate: string | null, status: TaskStatus): string | null {
  const days = daysUntil(dueDate)
  if (days === null || status === 'done') return null
  if (days < 0) return `просрочено на ${plural(-days, 'день', 'дня', 'дней')}`
  if (days === 0) return 'срок сегодня'
  if (days === 1) return 'остался 1 день'
  return `осталось ${plural(days, 'день', 'дня', 'дней')}`
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`
  return `${count} ${many}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/** Сегодняшняя дата в формате, который понимает input[type=date]. */
export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}
