import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.js'
import {
  FormError,
  parseDueDate,
  parseForm,
  parseStatus,
  parseTitle,
  removeFiles,
  respondToForm,
} from '../lib/forms.js'
import {
  addAttachments,
  createTask,
  deleteTask,
  getStats,
  getTask,
  isOverdue,
  listTasks,
  removeAttachment,
  updateTask,
} from '../lib/store.js'
import type { Task } from '../types.js'
import { isStatusFilter } from '../types.js'

/** Добавляем к задаче вычисляемые поля, чтобы фронтенд не дублировал логику. */
function serialize(task: Task) {
  return {
    ...task,
    overdue: isOverdue(task),
    attachments: task.attachments.map((attachment) => ({
      ...attachment,
      url: `${config.publicUrl}/uploads/${attachment.storedName}`,
    })),
  }
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tasks', async (request: FastifyRequest<{ Querystring: { status?: string; q?: string } }>) => {
    const filter = isStatusFilter(request.query.status) ? request.query.status : 'all'
    const query = request.query.q ?? ''
    return {
      filter,
      query,
      stats: getStats(),
      tasks: listTasks(filter, query).map(serialize),
    }
  })

  app.get('/api/tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const task = getTask(request.params.id)
    if (!task) return reply.code(404).send({ error: 'Задача не найдена' })
    return { task: serialize(task) }
  })

  /** Создание задачи: форма с файлами (multipart/form-data). */
  app.post('/api/tasks', async (request, reply) => {
    const { fields, files } = await parseForm(request)
    try {
      const task = await createTask(
        {
          title: parseTitle(fields.title),
          description: (fields.description ?? '').trim(),
          status: parseStatus(fields.status),
          dueDate: parseDueDate(fields.dueDate),
        },
        files,
      )
      return respondToForm(request, reply, {
        returnTo: fields.returnTo,
        notice: `Задача «${task.title}» создана`,
        payload: serialize(task),
      })
    } catch (error) {
      await removeFiles(files)
      throw error
    }
  })

  /** Редактирование задачи (название, описание, статус, ожидаемая дата завершения). */
  app.post('/api/tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { fields, files } = await parseForm(request)
    await removeFiles(files)
    if (!getTask(request.params.id)) return reply.code(404).send({ error: 'Задача не найдена' })

    const task = await updateTask(request.params.id, {
      title: parseTitle(fields.title),
      description: (fields.description ?? '').trim(),
      status: parseStatus(fields.status),
      dueDate: parseDueDate(fields.dueDate),
    })
    return respondToForm(request, reply, {
      returnTo: fields.returnTo,
      fallbackPath: `/tasks/${request.params.id}`,
      notice: 'Задача обновлена',
      payload: task ? serialize(task) : undefined,
    })
  })

  /** Быстрое переключение статуса прямо из таблицы. */
  app.post('/api/tasks/:id/status', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { fields } = await parseForm(request)
    const current = getTask(request.params.id)
    if (!current) return reply.code(404).send({ error: 'Задача не найдена' })

    const task = await updateTask(request.params.id, { status: parseStatus(fields.status, current.status) })
    return respondToForm(request, reply, {
      returnTo: fields.returnTo,
      notice: `Статус задачи «${task!.title}» обновлён`,
      payload: task ? serialize(task) : undefined,
    })
  })

  /** Перенос ожидаемой даты завершения. */
  app.post('/api/tasks/:id/due-date', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { fields } = await parseForm(request)
    if (!getTask(request.params.id)) return reply.code(404).send({ error: 'Задача не найдена' })

    const task = await updateTask(request.params.id, { dueDate: parseDueDate(fields.dueDate) })
    return respondToForm(request, reply, {
      returnTo: fields.returnTo,
      notice: task!.dueDate ? `Срок перенесён на ${task!.dueDate}` : 'Срок снят',
      payload: task ? serialize(task) : undefined,
    })
  })

  app.post('/api/tasks/:id/delete', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { fields } = await parseForm(request)
    const task = await deleteTask(request.params.id)
    if (!task) return reply.code(404).send({ error: 'Задача не найдена' })
    await removeFiles(task.attachments)
    return respondToForm(request, reply, {
      returnTo: fields.returnTo,
      notice: `Задача «${task.title}» удалена`,
    })
  })

  /** Прикрепление файлов к существующей задаче. */
  app.post('/api/tasks/:id/attachments', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { fields, files } = await parseForm(request)
    if (!getTask(request.params.id)) {
      await removeFiles(files)
      return reply.code(404).send({ error: 'Задача не найдена' })
    }
    if (files.length === 0) {
      return respondToForm(request, reply, {
        returnTo: fields.returnTo,
        fallbackPath: `/tasks/${request.params.id}`,
        error: 'Не выбрано ни одного файла',
      })
    }

    const task = await addAttachments(request.params.id, files)
    return respondToForm(request, reply, {
      returnTo: fields.returnTo,
      fallbackPath: `/tasks/${request.params.id}`,
      notice: files.length === 1 ? 'Файл прикреплён' : `Прикреплено файлов: ${files.length}`,
      payload: task ? serialize(task) : undefined,
    })
  })

  app.post(
    '/api/tasks/:id/attachments/:attachmentId/delete',
    async (request: FastifyRequest<{ Params: { id: string; attachmentId: string } }>, reply: FastifyReply) => {
      const { fields } = await parseForm(request)
      const attachment = await removeAttachment(request.params.id, request.params.attachmentId)
      if (!attachment) return reply.code(404).send({ error: 'Вложение не найдено' })
      await removeFiles([attachment])
      return respondToForm(request, reply, {
        returnTo: fields.returnTo,
        fallbackPath: `/tasks/${request.params.id}`,
        notice: `Файл «${attachment.originalName}» удалён`,
      })
    },
  )
}

export { FormError }
