/**
 * Клиент к Fastify-бэкенду.
 *
 * GET-запросы выполняются во время серверного рендеринга (в загрузчиках маршрутов),
 * поэтому браузер получает уже готовую разметку. Все изменения данных идут не отсюда,
 * а обычной отправкой HTML-формы прямо на эндпоинты бэкенда — см. `formAction()`.
 */

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4001'

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const STATUS_FILTERS = ['all', 'todo', 'in_progress', 'done', 'overdue'] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export interface Attachment {
  id: string
  originalName: string
  storedName: string
  mimeType: string
  size: number
  uploadedAt: string
  url: string
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  dueDate: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  overdue: boolean
  attachments: Attachment[]
}

export interface TaskStats {
  all: number
  todo: number
  in_progress: number
  done: number
  overdue: number
}

export interface TaskListResponse {
  filter: StatusFilter
  query: string
  stats: TaskStats
  tasks: Task[]
}

export function isStatusFilter(value: unknown): value is StatusFilter {
  return typeof value === 'string' && (STATUS_FILTERS as readonly string[]).includes(value)
}

/** Абсолютный адрес эндпоинта бэкенда — подставляется в атрибут action у формы. */
export function formAction(path: string): string {
  return `${API_URL}${path}`
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Бэкенд ответил ${response.status} на ${path}`)
  }
  return (await response.json()) as T
}

export function fetchTasks(params: { status?: StatusFilter; q?: string }): Promise<TaskListResponse> {
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  const suffix = search.size > 0 ? `?${search}` : ''
  return getJson<TaskListResponse>(`/api/tasks${suffix}`)
}

export function fetchTask(id: string): Promise<{ task: Task }> {
  return getJson<{ task: Task }>(`/api/tasks/${id}`)
}
