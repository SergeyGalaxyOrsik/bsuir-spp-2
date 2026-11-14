# Нагрузочные тесты GeoPulse (k6)

Сценарии на [k6](https://k6.io) для федеративного GraphQL API (шлюз `:4000`) и SSR-фронтенда (`:3100`).
Запросы скопированы из страниц веб-интерфейса (`apps/web/src/routes/**`), поэтому нагрузка похожа на
реальных пользователей: дашборд, список землетрясений с фильтрами и курсорной пагинацией, карточка
страны (federated-запрос через geo → seismic → hazards), природные события, список стран.

Результаты последнего прогона и выводы: [RESULTS.md](RESULTS.md).

## Запуск

```bash
# стек должен быть запущен: docker compose up -d
./load-tests/run.sh smoke         # 1 VU, 30 с — проверка, что всё отвечает без ошибок
./load-tests/run.sh protections   # проверка rate limit / cost / depth / aliases (нормальные лимиты!)
./load-tests/run.sh web           # SSR-страницы, до 5 VU, 45 с
./load-tests/run.sh load          # базовая нагрузка, до 30 VU, ~1 мин 45 с
./load-tests/run.sh stress        # всплеск 5 → 50 VU, пик 20 с, всего 40 с
./load-tests/run.sh all           # всё по очереди (~5 мин чистого времени k6)
```

Дополнительные аргументы передаются в k6: `./load-tests/run.sh load --vus 10` и т. п.
Итоги пишутся в `load-tests/results/` (JSON-сводка k6, лог, выборки `docker stats` каждые 10 с).
Код выхода k6 `99` означает, что не выполнены пороги (thresholds), скрипт при этом не падает.

### Переменные окружения

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:4000` | адрес шлюза (для Kubernetes — адрес ingress/сервиса) |
| `GRAPHQL_PATH` | `/graphql` | путь GraphQL-эндпоинта |
| `WEB_URL` | `http://localhost:3100` | адрес SSR-фронтенда |
| `SPOOF_IP` | `1` | каждый VU отправляет свой `X-Real-IP` (+ `X-Internal-Token`), т. е. изображает отдельного клиента |
| `INTERNAL_TOKEN` | `geopulse-internal-dev-token` | сервисный токен; шлюз доверяет `X-Real-IP` только вместе с ним |
| `PEAK_VUS` | 30 / 50 / 5 | пик VU для `load` / `stress` / `web` |
| `THINK_MS` | 1000 / 300 / 1000 | средняя пауза «пользователя» между действиями |
| `RAISE_LIMITS` | `1` | для `load`/`stress` перезапустить шлюз с поднятыми лимитами (только docker compose) |

Пример для Kubernetes (лимиты в кластере нужно поднять через переменные деплоймента шлюза):

```bash
RAISE_LIMITS=0 BASE_URL=https://geopulse.example.local WEB_URL=https://geopulse.example.local \
  ./load-tests/run.sh load
```

## Что проверяет каждый сценарий

| Сценарий | Нагрузка | Что проверяется (thresholds) |
| --- | --- | --- |
| `smoke` | 1 VU, 30 с; каждую итерацию проходит все страницы | 0 % HTTP- и GraphQL-ошибок, p95 < 1,5 с |
| `load` | ramping-vus 1 → 10 → 30 VU, удержание 45 с; пауза ~1 с | ошибки < 1 %, p95 < 800 мс, p99 < 2 с; отдельно p95 для попаданий/промахов кеша и для каждой операции; доля попаданий в кеш для «фиксированных» запросов > 50 % |
| `stress` | 5 → 50 VU за 5 с, 20 с на пике, спад; пауза ~0,3 с, 90 % запросов со случайными переменными | ошибки < 5 %, p95 < 2,5 с, отказов 429/503 < 50 |
| `protections` | 1 VU, одна итерация | 100 запросов разом от одного IP → часть 429 с `Retry-After` и кодом `RATE_LIMITED`, после паузы клиента снова обслуживают; > 60 вызовов `earthquakeTimeline` в минуту отклоняются; запрос стоимостью ~58 500 → `COST_ESTIMATED_TOO_EXPENSIVE`; глубина 13 > 10 и 20 алиасов > 15 отклоняются; обычный запрос проходит |
| `web` | 1 → 5 VU, 45 с | все SSR-страницы отдают 200 с HTML, без ошибок рендера, p95 < 2 с |

### Кеш ответов

Каждый GraphQL-запрос помечается тегом `variant`:

- `fixed` — та же страница с настройками по умолчанию (одинаковые переменные), должна обслуживаться из кеша шлюза (TTL 30 с);
- `random` — случайные фильтры (порог магнитуды, страна, период, сортировка, строка поиска, курсор следующей страницы).

Метрика `gql_cache_hit` — доля ответов с `extensions.responseCache.hit = true`; `gql_req_duration{cache:hit|miss}` —
латентность отдельно для попаданий и промахов.

## Лимиты шлюза и почему они поднимаются

Шлюз ограничивает каждого клиента (ключ — `X-Real-IP`, если запрос несёт верный `X-Internal-Token`, иначе адрес сокета): token bucket 20 запросов/с,
всплеск 60; не более 200 одновременных запросов (дальше 503); `earthquakeTimeline`/`magnitudeHistogram` —
60 вызовов в минуту на клиента. Весь трафик k6 идёт с одного адреса, поэтому:

- каждый VU отправляет собственный `X-Real-IP` вместе с сервисным токеном (`SPOOF_IP=1`, `INTERNAL_TOKEN`), и лимиты на клиента действуют как у реальных пользователей. В Kubernetes передайте токен из секрета: `INTERNAL_TOKEN=... ./load-tests/run.sh load`;
- для `load`/`stress` `run.sh` дополнительно перезапускает **только** контейнер шлюза с
  `compose.loadtest.yml` (`RATE_LIMIT_PER_SECOND=2000`, `RATE_LIMIT_BURST=4000`), а по завершении (в том числе
  при Ctrl+C) возвращает обычные лимиты командой `docker compose up -d --no-deps gateway`.

Вручную:

```bash
docker compose -f docker-compose.yml -f load-tests/compose.loadtest.yml up -d --no-deps gateway   # поднять
docker compose up -d --no-deps gateway                                                             # вернуть
```

`protections` нужно запускать с **обычными** лимитами, иначе проверки 429 не пройдут.

## Безопасные пределы для ноутбука

Стенд: MacBook (12 CPU, 16 ГБ), Docker в OrbStack VM с лимитом 8 ГБ. Значения по умолчанию подобраны так,
чтобы не перегружать машину:

- не больше 30 VU в `load` и 50 VU (≤ 20 с) в `stress`; сценарии запускаются строго по очереди;
- при 30 VU контейнеры шлюза, seismic и Postgres занимают до 1,5–2 ядер каждый, память стека ≈ 2–2,5 ГБ;
- во время прогона полезно смотреть `docker stats` и дашборд Grafana «GeoPulse» (http://localhost:3001);
- если ноутбук начинает тормозить — `PEAK_VUS=15 ./load-tests/run.sh load`.

SSE-подписки (`earthquakeDetected`) в сценарии не включены: k6 не поддерживает SSE без расширений. Проверить
вручную: `curl -N -H 'accept: text/event-stream' 'http://localhost:4000/graphql?query=subscription%7BearthquakeDetected%7Bid%7D%7D'`.

## Структура

```
load-tests/
  run.sh                 запуск сценариев, переключение лимитов шлюза, сбор docker stats
  compose.loadtest.yml   override для шлюза с поднятыми лимитами
  lib/config.js          BASE_URL / WEB_URL / SPOOF_IP, общие пороги
  lib/queries.js         GraphQL-документы из UI + «злые» запросы для protections
  lib/graphql.js         отправка запроса, проверки, метрики (gql_errors, gql_cache_hit, gql_req_duration)
  lib/journeys.js        пользовательские сценарии страниц со случайными фильтрами и пагинацией
  scenarios/*.js         smoke, load, stress, protections, web
  results/               артефакты прогонов (в git не попадают)
```
