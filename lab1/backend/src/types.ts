export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const STATUS_FILTERS = ['all', ...TASK_STATUSES, 'overdue'] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export interface Attachment {
  id: string
  originalName: string
  storedName: string
  mimeType: string
  size: number
  uploadedAt: string
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
  attachments: Attachment[]
}

export interface TaskStats {
  all: number
  todo: number
  in_progress: number
  done: number
  overdue: number
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

export function isStatusFilter(value: unknown): value is StatusFilter {
  return typeof value === 'string' && (STATUS_FILTERS as readonly string[]).includes(value)
}
