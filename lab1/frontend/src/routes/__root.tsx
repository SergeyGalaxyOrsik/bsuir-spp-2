import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ListChecks } from 'lucide-react'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Список задач — SSR на TanStack Start и Fastify' },
      {
        name: 'description',
        content:
          'Учебное приложение с серверным рендерингом: список задач со статусами, фильтрацией, сроками и вложениями.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Не удалось отрисовать страницу</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        Проверьте, что бэкенд запущен на <code>http://localhost:4001</code>.
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Страница не найдена</h1>
      <Link to="/" search={{ status: 'all' }} className="mt-2 inline-block text-sm underline underline-offset-4">
        Вернуться к списку задач
      </Link>
    </div>
  ),
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="min-h-dvh bg-background">
          <header className="border-b bg-card">
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ListChecks className="size-5" />
              </span>
              <div>
                <Link to="/" search={{ status: 'all' }} className="text-base font-semibold tracking-tight">
                  Список задач
                </Link>
                <p className="text-xs text-muted-foreground">
                  Серверный рендеринг · отправка данных через формы
                </p>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </div>
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
