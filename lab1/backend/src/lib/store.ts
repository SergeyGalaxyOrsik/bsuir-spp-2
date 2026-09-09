import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import type { Attachment, StatusFilter, Task, TaskStats, TaskStatus } from '../types.js'

interface Database {
  tasks: Task[]
}

let db: Database = { tasks: [] }
let writeChain: Promise<void> = Promise.resolve()

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function seed(): Task[] {
  const now = new Date().toISOString()
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toISOString().slice(0, 10)
  }
  return [
    {
      id: randomUUID(),
      title: 'Прочитать методичку к лабораторной работе',
      description: 'Разобраться с требованиями к серверному рендерингу и отправке форм.',
      status: 'done',
      dueDate: day(-3),
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      attachments: [],
    },
    {
      id: randomUUID(),
      title: 'Реализовать загрузку вложений',
      description: 'multipart/form-data, ограничение 10 МБ на файл.',
      status: 'in_progress',
      dueDate: day(2),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      attachments: [],
    },
    {
      id: randomUUID(),
      title: 'Сдать лабораторную работу',
      description: 'Показать фильтрацию по статусу и сроки выполнения.',
      status: 'todo',
      dueDate: day(-1),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      attachments: [],
    },
  ]
}

export async function initStore(): Promise<void> {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true })
  await fs.mkdir(config.uploadsDir, { recursive: true })
  try {
    const raw = await fs.readFile(config.dataFile, 'utf8')
    const parsed = JSON.parse(raw) as Partial<Database>
    db = { tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [] }
  } catch {
    db = { tasks: seed() }
    await persist()
  }
}

function persist(): Promise<void> {
  writeChain = writeChain.then(async () => {
    const tmp = `${config.dataFile}.tmp`
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8')
    await fs.rename(tmp, config.dataFile)
  })
  return writeChain
}

function isOverdue(task: Task): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < today()
}

function sortTasks(tasks: Task[]): Task[] {
  const weight: Record<TaskStatus, number> = { in_progress: 0, todo: 1, done: 2 }
  return [...tasks].sort((a, b) => {
    if (weight[a.status] !== weight[b.status]) return weight[a.status] - weight[b.status]
    // Задачи без срока уходят в конец своей группы.
    if (a.dueDate !== b.dueDate) return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function listTasks(filter: StatusFilter = 'all', query = ''): Task[] {
  const q = query.trim().toLowerCase()
  const filtered = db.tasks.filter((task) => {
    if (filter === 'overdue' && !isOverdue(task)) return false
    if (filter !== 'all' && filter !== 'overdue' && task.status !== filter) return false
    if (q && !`${task.title} ${task.description}`.toLowerCase().includes(q)) return false
    return true
  })
  return sortTasks(filtered)
}

export function getStats(): TaskStats {
  return {
    all: db.tasks.length,
    todo: db.tasks.filter((t) => t.status === 'todo').length,
    in_progress: db.tasks.filter((t) => t.status === 'in_progress').length,
    done: db.tasks.filter((t) => t.status === 'done').length,
    overdue: db.tasks.filter(isOverdue).length,
  }
}

export function getTask(id: string): Task | undefined {
  return db.tasks.find((task) => task.id === id)
}

export interface TaskInput {
  title: string
  description: string
  status: TaskStatus
  dueDate: string | null
}

export async function createTask(input: TaskInput, attachments: Attachment[]): Promise<Task> {
  const now = new Date().toISOString()
  const task: Task = {
    id: randomUUID(),
    title: input.title,
    description: input.description,
    status: input.status,
    dueDate: input.dueDate,
    createdAt: now,
    updatedAt: now,
    completedAt: input.status === 'done' ? now : null,
    attachments,
  }
  db.tasks.push(task)
  await persist()
  return task
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<Task | undefined> {
  const task = getTask(id)
  if (!task) return undefined
  if (patch.title !== undefined) task.title = patch.title
  if (patch.description !== undefined) task.description = patch.description
  if (patch.dueDate !== undefined) task.dueDate = patch.dueDate
  if (patch.status !== undefined && patch.status !== task.status) {
    task.status = patch.status
    task.completedAt = patch.status === 'done' ? new Date().toISOString() : null
  }
  task.updatedAt = new Date().toISOString()
  await persist()
  return task
}

export async function deleteTask(id: string): Promise<Task | undefined> {
  const index = db.tasks.findIndex((task) => task.id === id)
  if (index === -1) return undefined
  const [task] = db.tasks.splice(index, 1)
  await persist()
  return task
}

export async function addAttachments(id: string, attachments: Attachment[]): Promise<Task | undefined> {
  const task = getTask(id)
  if (!task) return undefined
  task.attachments.push(...attachments)
  task.updatedAt = new Date().toISOString()
  await persist()
  return task
}

export async function removeAttachment(taskId: string, attachmentId: string): Promise<Attachment | undefined> {
  const task = getTask(taskId)
  if (!task) return undefined
  const index = task.attachments.findIndex((a) => a.id === attachmentId)
  if (index === -1) return undefined
  const [attachment] = task.attachments.splice(index, 1)
  task.updatedAt = new Date().toISOString()
  await persist()
  return attachment
}

export { isOverdue }
