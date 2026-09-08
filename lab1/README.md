# Лабораторная работа №1 — приложение с серверным рендерингом

Список задач со статусами, фильтрацией, ожидаемой датой завершения и вложениями.
Разметку целиком формирует сервер, а все изменения данных уходят на сервер обычной
отправкой HTML-формы (`<form method="post">`), без клиентского JavaScript.

## Стек

| Слой | Технологии |
| --- | --- |
| Монорепозиторий | Turborepo + pnpm workspaces |
| Бэкенд (`backend/`) | Node.js, Fastify 5, `@fastify/multipart`, `@fastify/formbody`, `@fastify/static` |
| Фронтенд (`frontend/`) | TanStack Start (SSR поверх TanStack Router и Vite), React 19 |
| UI | shadcn/ui (вариант на Base UI): Badge, Table, Tabs, Card, Button, Input, Label, Textarea, Separator |
| Хранилище | JSON-файл `backend/data/db.json`, файлы — в `backend/uploads/` |

## Запуск

```bash
pnpm install     # установка зависимостей всех пакетов
pnpm dev         # turbo поднимает бэкенд и фронтенд одновременно
```

* Приложение — <http://localhost:4000>
* API — <http://localhost:4001>

Порт 4000 выбран потому, что 3000 на машине разработки занят; поменять его можно
переменными окружения (см. ниже).

Продакшен-режим:

```bash
pnpm build       # turbo собирает оба пакета
pnpm start       # tsc-сборка бэкенда + vite preview для SSR-фронтенда
```

Прочие команды: `pnpm typecheck`, `pnpm clean`.

## Как это устроено

### Сервер отдаёт готовую разметку

Загрузчики маршрутов (`loader` в `frontend/src/routes/*.tsx`) выполняются на сервере
во время рендеринга: они ходят в Fastify за списком задач, и браузер получает готовый
HTML со всей таблицей. Отключите JavaScript — страница по-прежнему отображается,
фильтры работают, формы отправляются.

### Данные уходят на сервер формами

Каждая форма указывает `action` прямо на эндпоинт Fastify:

```html
<form method="post" action="http://localhost:4001/api/tasks" enctype="multipart/form-data">
```

Бэкенд обрабатывает запрос и по схеме **POST/Redirect/GET** отвечает `303 See Other`,
возвращая пользователя на страницу из скрытого поля `returnTo`. Результат операции
приезжает в query-параметре `notice` или `error` и показывается баннером.
Редирект разрешён только на адрес фронтенда — сторонние адреса в `returnTo`
игнорируются (защита от open redirect).

Фильтр по статусу (`Tabs`) — это набор обычных ссылок `/?status=…`, поэтому
фильтрация тоже полностью серверная.

### Эндпоинты бэкенда

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/tasks?status=&q=` | список задач + счётчики для вкладок (используется при SSR) |
| `GET` | `/api/tasks/:id` | одна задача |
| `POST` | `/api/tasks` | создание задачи, `multipart/form-data` с файлами |
| `POST` | `/api/tasks/:id` | редактирование названия, описания, статуса и срока |
| `POST` | `/api/tasks/:id/status` | быстрая смена статуса из таблицы |
| `POST` | `/api/tasks/:id/due-date` | перенос ожидаемой даты завершения |
| `POST` | `/api/tasks/:id/delete` | удаление задачи вместе с её файлами |
| `POST` | `/api/tasks/:id/attachments` | загрузка вложений |
| `POST` | `/api/tasks/:id/attachments/:attachmentId/delete` | удаление вложения |
| `GET` | `/uploads/:file` | отдача загруженных файлов |

GET-эндпоинты отвечают JSON, POST-эндпоинты — редиректом для браузера и JSON, если
клиент прислал заголовок `Accept: application/json`.

### Ограничения загрузки

Не более 5 файлов за одну отправку, каждый до 10 МБ. Превышение не роняет запрос:
пользователь возвращается на страницу с сообщением об ошибке.

## Переменные окружения

| Пакет | Переменная | По умолчанию |
| --- | --- | --- |
| backend | `PORT` | `4001` |
| backend | `FRONTEND_URL` | `http://localhost:4000` — единственный разрешённый адрес для редиректа |
| backend | `PUBLIC_URL` | `http://localhost:4001` — база для ссылок на файлы |
| backend | `DATA_FILE`, `UPLOADS_DIR` | `backend/data/db.json`, `backend/uploads` |
| frontend | `VITE_API_URL` | `http://localhost:4001` |

При первом запуске база создаётся автоматически и наполняется тремя демонстрационными
задачами.

## Структура

```
.
├── turbo.json            # пайплайны dev / build / start / typecheck
├── pnpm-workspace.yaml
├── backend/
│   └── src/
│       ├── server.ts         # сборка Fastify, плагины, обработчик ошибок форм
│       ├── config.ts         # порты, пути, лимиты
│       ├── types.ts          # статусы задач, модель данных
│       ├── lib/store.ts      # хранилище задач в JSON-файле
│       ├── lib/forms.ts      # разбор multipart/urlencoded, валидация, редиректы
│       └── routes/tasks.ts   # HTTP-эндпоинты
└── frontend/
    └── src/
        ├── routes/__root.tsx           # HTML-документ, шапка
        ├── routes/index.tsx            # список, фильтры, форма создания
        ├── routes/tasks.$taskId.tsx    # карточка задачи, редактирование, вложения
        ├── components/ui/              # компоненты shadcn/ui
        ├── components/                 # бейджи статуса, вкладки-фильтры, баннер
        └── lib/                        # клиент API и форматирование
```

## Замечание о выборе компонентов

Для выпадающих списков используется нативный `<select>`
(`frontend/src/components/native-select.tsx`), а не `Select` из shadcn/ui: последний
построен на попапе и требует JavaScript, тогда как значение нативного элемента
уходит на сервер вместе с остальными полями формы.
