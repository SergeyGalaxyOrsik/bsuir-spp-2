import { Link, createFileRoute, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, Download, Paperclip, Trash2, Upload } from 'lucide-react'

import { NoticeBanner } from '#/components/notice-banner'
import { NativeSelect } from '#/components/native-select'
import { OverdueBadge, StatusBadge } from '#/components/status-badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { Textarea } from '#/components/ui/textarea'
import { TASK_STATUSES, fetchTask, formAction } from '#/lib/api'
import {
  STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatDeadlineHint,
  formatFileSize,
} from '#/lib/format'

interface TaskSearch {
  notice?: string
  error?: string
}

export const Route = createFileRoute('/tasks/$taskId')({
  validateSearch: (search: Record<string, unknown>): TaskSearch => ({
    notice: typeof search.notice === 'string' ? search.notice : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  loader: ({ params }) => fetchTask(params.taskId),
  component: TaskDetailPage,
})

function TaskDetailPage() {
  const { task } = Route.useLoaderData()
  const { notice, error } = Route.useSearch()
  const returnTo = useRouterState({ select: (state) => state.location.href })
  const hint = formatDeadlineHint(task.dueDate, task.status)

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" search={{ status: 'all' }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Ко всем задачам
      </Link>

      <NoticeBanner notice={notice} error={error} />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {task.title}
            <StatusBadge status={task.status} />
            {task.overdue && <OverdueBadge />}
          </CardTitle>
          <CardDescription>
            Создана {formatDateTime(task.createdAt)} · изменена {formatDateTime(task.updatedAt)}
            {task.completedAt && ` · выполнена ${formatDateTime(task.completedAt)}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Ожидаемое завершение: </span>
            <span className="font-medium">{formatDate(task.dueDate)}</span>
            {hint && <span className={task.overdue ? ' text-destructive' : ' text-muted-foreground'}> ({hint})</span>}
          </div>

          <Separator />

          <form
            method="post"
            action={formAction(`/api/tasks/${task.id}`)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <input type="hidden" name="returnTo" value={returnTo} />

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="title">Название</Label>
              <Input id="title" name="title" defaultValue={task.title} required maxLength={200} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="status">Статус</Label>
              <NativeSelect id="status" name="status" defaultValue={task.status}>
                {TASK_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="dueDate">Ожидаемая дата завершения</Label>
              <Input id="dueDate" name="dueDate" type="date" defaultValue={task.dueDate ?? ''} />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea id="description" name="description" rows={4} defaultValue={task.description} />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit">Сохранить</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="size-4" />
            Вложения ({task.attachments.length})
          </CardTitle>
          <CardDescription>Файлы хранятся на бэкенде и отдаются им же по адресу /uploads.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {task.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">К задаче пока ничего не прикреплено.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {task.attachments.map((attachment) => (
                <li key={attachment.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-2 text-sm underline-offset-4 hover:underline"
                  >
                    <Download className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{attachment.originalName}</span>
                  </a>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    {formatFileSize(attachment.size)} · {formatDateTime(attachment.uploadedAt)}
                  </span>
                  <form
                    method="post"
                    action={formAction(`/api/tasks/${task.id}/attachments/${attachment.id}/delete`)}
                  >
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <Button type="submit" size="icon-sm" variant="ghost" aria-label={`Удалить ${attachment.originalName}`}>
                      <Trash2 />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form
            method="post"
            action={formAction(`/api/tasks/${task.id}/attachments`)}
            encType="multipart/form-data"
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="grid flex-1 gap-2">
              <Label htmlFor="files">Прикрепить файлы</Label>
              <Input id="files" name="files" type="file" multiple required className="h-auto py-1.5" />
            </div>
            <Button type="submit" variant="outline">
              <Upload />
              Загрузить
            </Button>
          </form>
        </CardContent>
      </Card>

      <form method="post" action={formAction(`/api/tasks/${task.id}/delete`)}>
        <input type="hidden" name="returnTo" value="/" />
        <Button type="submit" variant="destructive">
          <Trash2 />
          Удалить задачу
        </Button>
      </form>
    </div>
  )
}
