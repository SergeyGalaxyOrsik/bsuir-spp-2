import { Link, createFileRoute, useRouterState } from '@tanstack/react-router'
import { Paperclip, Plus, Search, Trash2 } from 'lucide-react'

import { NoticeBanner } from '#/components/notice-banner'
import { NativeSelect } from '#/components/native-select'
import { OverdueBadge, StatusBadge } from '#/components/status-badge'
import { StatusFilterTabs } from '#/components/status-filter-tabs'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import {
  TASK_STATUSES,
  fetchTasks,
  formAction,
  isStatusFilter,
  type StatusFilter,
} from '#/lib/api'
import { STATUS_LABELS, formatDate, formatDeadlineHint, todayInputValue } from '#/lib/format'

interface IndexSearch {
  status: StatusFilter
  q?: string
  notice?: string
  error?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): IndexSearch => ({
    status: isStatusFilter(search.status) ? search.status : 'all',
    q: typeof search.q === 'string' && search.q.trim() !== '' ? search.q : undefined,
    notice: typeof search.notice === 'string' ? search.notice : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  // Сообщения из редиректов не влияют на выборку данных — в зависимости загрузчика не входят.
  loaderDeps: ({ search }) => ({ status: search.status, q: search.q }),
  // Загрузчик выполняется на сервере при первом заходе: клиент получает готовый HTML.
  loader: ({ deps }) => fetchTasks(deps),
  component: TaskListPage,
})

function TaskListPage() {
  const { status, q, notice, error } = Route.useSearch()
  const { tasks, stats } = Route.useLoaderData()
  /** Адрес текущей страницы — бэкенд вернёт сюда пользователя после обработки формы. */
  const returnTo = useRouterState({ select: (state) => state.location.href })

  return (
    <div className="flex flex-col gap-6">
      <NoticeBanner notice={notice} error={error} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-4" />
            Новая задача
          </CardTitle>
          <CardDescription>
            Форма отправляется как <code>multipart/form-data</code> прямо на Fastify — можно сразу
            приложить файлы.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            method="post"
            action={formAction('/api/tasks')}
            encType="multipart/form-data"
            className="grid gap-4 sm:grid-cols-2"
          >
            <input type="hidden" name="returnTo" value={returnTo} />

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="new-title">Название</Label>
              <Input
                id="new-title"
                name="title"
                required
                maxLength={200}
                placeholder="Например: подготовить отчёт"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-due-date">Ожидаемая дата завершения</Label>
              <Input id="new-due-date" name="dueDate" type="date" min="1970-01-01" defaultValue={todayInputValue()} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-status">Статус</Label>
              <NativeSelect id="new-status" name="status" defaultValue="todo">
                {TASK_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="new-description">Описание</Label>
              <Textarea id="new-description" name="description" rows={2} placeholder="Необязательно" />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="new-files">Вложения</Label>
              <Input id="new-files" name="files" type="file" multiple className="h-auto py-1.5" />
              <p className="text-xs text-muted-foreground">До 5 файлов, каждый не больше 10 МБ.</p>
            </div>

            <div className="sm:col-span-2">
              <Button type="submit">Добавить задачу</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <StatusFilterTabs value={status} stats={stats} query={q ?? ''} />

          {/* Поиск — обычная GET-форма: результат снова рендерит сервер. */}
          <form method="get" action="/" className="flex w-full gap-2 sm:w-auto">
            <input type="hidden" name="status" value={status} />
            <Input
              name="q"
              defaultValue={q ?? ''}
              placeholder="Поиск по названию"
              className="sm:w-56"
              aria-label="Поиск по названию"
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Искать">
              <Search />
            </Button>
          </form>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64">Задача</TableHead>
                <TableHead className="w-56">Статус</TableHead>
                <TableHead className="w-56">Ожидаемое завершение</TableHead>
                <TableHead className="w-32 text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    Задач по выбранному фильтру нет.
                  </TableCell>
                </TableRow>
              )}

              {tasks.map((task) => {
                const hint = formatDeadlineHint(task.dueDate, task.status)
                return (
                  <TableRow key={task.id}>
                    <TableCell className="align-top">
                      <Link
                        to="/tasks/$taskId"
                        params={{ taskId: task.id }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {task.title}
                      </Link>
                      {task.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
                      )}
                      {task.attachments.length > 0 && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="size-3" />
                          вложений: {task.attachments.length}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={task.status} />
                          {task.overdue && <OverdueBadge />}
                        </div>
                        <form
                          method="post"
                          action={formAction(`/api/tasks/${task.id}/status`)}
                          className="flex items-center gap-1"
                        >
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <NativeSelect
                            name="status"
                            defaultValue={task.status}
                            aria-label={`Статус задачи «${task.title}»`}
                            className="h-8 w-40 text-xs"
                          >
                            {TASK_STATUSES.map((value) => (
                              <option key={value} value={value}>
                                {STATUS_LABELS[value]}
                              </option>
                            ))}
                          </NativeSelect>
                          <Button type="submit" size="sm" variant="outline">
                            ОК
                          </Button>
                        </form>
                      </div>
                    </TableCell>

                    <TableCell className="align-top">
                      <div className="flex flex-col gap-2">
                        <div className="text-sm">{formatDate(task.dueDate)}</div>
                        {hint && (
                          <div className={task.overdue ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                            {hint}
                          </div>
                        )}
                        <form
                          method="post"
                          action={formAction(`/api/tasks/${task.id}/due-date`)}
                          className="flex items-center gap-1"
                        >
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <Input
                            type="date"
                            name="dueDate"
                            defaultValue={task.dueDate ?? ''}
                            aria-label={`Срок задачи «${task.title}»`}
                            className="h-8 w-40 text-xs"
                          />
                          <Button type="submit" size="sm" variant="outline">
                            ОК
                          </Button>
                        </form>
                      </div>
                    </TableCell>

                    <TableCell className="align-top text-right">
                      <div className="flex flex-col items-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          render={<Link to="/tasks/$taskId" params={{ taskId: task.id }} />}
                        >
                          Открыть
                        </Button>
                        <form method="post" action={formAction(`/api/tasks/${task.id}/delete`)}>
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <Button type="submit" size="sm" variant="destructive">
                            <Trash2 />
                            Удалить
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
