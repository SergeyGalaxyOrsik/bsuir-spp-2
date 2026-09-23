import type { ReactNode } from 'react';
import Deck from './deck/Deck';
import Slide from './deck/Slide';
import Build from './deck/Build';
import { useDeck } from './deck/DeckContext';
import {
  ApplyGraph,
  ClusterArchitectureGraph,
  KubeletGraph,
  ReplicaGraph,
  TrafficGraph,
} from './components/ArchitectureGraph';
import RecoveryTimeline from './components/RecoveryTimeline';
import { NestingScene, PlaneLossScene, ReconcileScene } from './components/ClarityScenes';
import './styles/k8s.css';

const sources = {
  architecture: 'https://kubernetes.io/docs/concepts/overview/components/',
  objects: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/',
  controllers: 'https://kubernetes.io/docs/concepts/architecture/controller/',
  pods: 'https://kubernetes.io/docs/concepts/workloads/pods/',
  deployments: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/',
  api: 'https://kubernetes.io/docs/reference/access-authn-authz/controlling-access/',
  etcd: 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/',
  scheduler: 'https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/',
  cloud: 'https://kubernetes.io/docs/concepts/architecture/cloud-controller/',
  nodes: 'https://kubernetes.io/docs/concepts/architecture/nodes/',
  kubelet: 'https://kubernetes.io/docs/reference/command-line-tools-reference/kubelet/',
  cri: 'https://kubernetes.io/docs/concepts/containers/cri/',
  service: 'https://kubernetes.io/docs/concepts/services-networking/service/',
  network: 'https://kubernetes.io/docs/reference/networking/virtual-ips/',
  probes: 'https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/',
  lifecycle: 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/',
  raft: 'https://etcd.io/docs/v3.6/faq/',
  spread: 'https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/',
  static: 'https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/',
  resources: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/',
};

type Tone = 'control' | 'work' | 'warn' | 'error' | 'quiet';

function Item({ children, sub, tone = 'quiet', className = '' }: { children: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  return <div className={'t-item t-' + tone + ' ' + className}><strong>{children}</strong>{sub && <span>{sub}</span>}</div>;
}

function Pod({ name = 'web', tone = 'work' }: { name?: string; tone?: Tone }) {
  return <div className={'t-pod t-' + tone}><span className="t-pod-mark" />{name}</div>;
}

function Node({ name, count = 1, down = false, compact = false }: { name: string; count?: number; down?: boolean; compact?: boolean }) {
  return <div className={'t-node' + (down ? ' is-down' : '') + (compact ? ' is-compact' : '')}>
    <div className="t-node-top"><strong>{name}</strong><span>{down ? 'Недоступен' : 'Работает'}</span></div>
    <div className="t-node-pods">{Array.from({ length: count }, (_, index) => <Pod key={index} tone={down ? 'error' : 'work'} />)}</div>
  </div>;
}

function Cluster({ failOnClick = false, down = false, recovered = false, control = false }: { failOnClick?: boolean; down?: boolean; recovered?: boolean; control?: boolean }) {
  const { clicks } = useDeck();
  const firstDown = down || (failOnClick && clicks >= 1);
  return <div className="t-cluster">
    {control && <div className="t-cluster-plane"><b>Control Plane</b><span>API server · etcd · controllers · scheduler</span></div>}
    <div className="t-cluster-nodes"><Node name="node-1" down={firstDown} /><Node name="node-2" count={recovered ? 2 : 1} /><Node name="node-3" /></div>
  </div>;
}

function Arrow({ vertical = false }: { vertical?: boolean }) { return <span className={'t-arrow' + (vertical ? ' vertical' : '')} aria-hidden>{vertical ? '↓' : '→'}</span>; }
function Flow({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={'t-flow ' + className}>{children}</div>; }
function Takeaway({ children }: { children: ReactNode }) { return <p className="t-takeaway">{children}</p>; }

function FailureScene() {
  return <div className="t-failure-scene"><Cluster failOnClick /><Build at={1} className="t-failure-caption"><span>node-1 отключился</span><span>Кто восстановит третий экземпляр?</span></Build></div>;
}

function ReplicaScene() {
  const { clicks } = useDeck();
  return <ReplicaGraph recovered={clicks >= 1} fallback={<div className="t-replica"><div className="t-replica-top"><Item tone="control" sub="replicas: 3">Deployment</Item><Arrow /><Item tone="control" sub="поддерживает набор">ReplicaSet</Item></div><div className="t-replica-branch" /><div className="t-replica-pods"><Pod name="web-a" /><Pod name="web-b" /><Build at={1}><Pod name="web-new" /></Build></div></div>} />;
}

function SchedulerScene() {
  return <div className="t-scheduler"><div className="t-scheduler-intro"><Pod name="новый Pod" tone="warn" /><span>Нужны ресурсы и подходящая архитектура</span></div><div className="t-scheduler-list"><div><strong>node-1</strong><span>Недостаточно запрошенных CPU</span><b>исключён</b></div><div><strong>node-2</strong><span>Другая архитектура</span><b>исключён</b></div><div className="selected"><strong>node-3</strong><span>Требования выполнены</span><b>выбран</b></div></div><Build at={1}><div className="t-scheduler-result">Pod назначен на node-3. Контейнер ещё не запущен.</div></Build></div>;
}

function QuorumScene() {
  const { clicks } = useDeck();
  return <div className={'t-quorum' + (clicks >= 1 ? ' is-lost' : '')}><div className="t-quorum-count"><strong>{clicks >= 1 ? '1 / 3' : '2 / 3'}</strong><span>{clicks >= 1 ? 'кворума нет' : 'кворум есть'}</span></div><div className="t-quorum-members"><Item tone="control">etcd-1</Item><Item tone={clicks >= 1 ? 'error' : 'control'}>etcd-2</Item><Item tone="error">etcd-3</Item></div><Build at={1}><Takeaway>Потеря второго участника останавливает согласование изменений.</Takeaway></Build></div>;
}

type Page = { nav: string; title: ReactNode; lead?: ReactNode; visual: ReactNode; notes: string; source: string; mode?: 'cover' | 'split' | 'diagram' | 'poster' };
const pages: Page[] = [
  {
    nav: 'Вопрос', mode: 'cover', title: <>Кто вернёт приложение в строй?</>,
    lead: 'Есть три экземпляра веб-приложения. Что будет, если отключится один сервер?',
    visual: <FailureScene />,
    notes: 'Начните с вопроса. На трёх машинах работает по одному экземпляру веб-приложения. После клика первый узел отключается. Спросите аудиторию: кто обнаружит отказ, кто создаст замену, где она появится и что будет с трафиком? Ответ раскроется в конце.', source: sources.architecture,
  },
  {
    nav: 'Зачем Kubernetes', mode: 'poster', title: <>Один контейнер запустить просто. Три на разных машинах нужно поддерживать.</>,
    visual: <div className="t-four-actions"><span>Где запустить?</span><span>Сколько держать?</span><span>Как обновить?</span><span>Что делать при сбое?</span></div>,
    notes: 'Когда контейнер один, его можно запустить вручную. С множеством приложений и машин нужны размещение, масштабирование, обновление и восстановление. Kubernetes координирует эти задачи. Он не исправляет дефекты бизнес-логики.', source: sources.architecture,
  },
  {
    nav: 'Желаемое состояние', title: <>Система стремится к заданному состоянию</>,
    lead: 'Мы указываем результат. Контроллеры регулярно сравнивают его с реальностью.',
    visual: <ReconcileScene />,
    notes: 'В spec обычно записано желаемое состояние, status отражает наблюдаемое. Здесь нужны три Pod, пока существуют два. Контроллер видит расхождение и создаёт новый. Важно: неуспешная readiness-проверка сама по себе не означает создание дополнительного Pod.', source: sources.controllers,
  },
  {
    nav: 'Node, Pod, Container', mode: 'split', title: <>Машина, Pod и контейнер не одно и то же</>,
    lead: 'Pod целиком размещается на одном узле. Внутри него может быть несколько контейнеров.',
    visual: <NestingScene />,
    notes: 'Node это машина. Pod минимальная развёртываемая единица Kubernetes. Контейнеры одного Pod вместе размещаются на одном узле, делят сетевое пространство и могут делить тома. Для трёх независимых экземпляров нужны три Pod, а не три контейнера в одном Pod.', source: sources.pods,
  },
  {
    nav: 'Две части кластера', title: <>Управление принимает решения. Узлы выполняют приложения.</>,
    visual: <ClusterArchitectureGraph fallback={<div className="t-architecture"><div className="t-architecture-plane"><strong>Control Plane</strong><span>API · состояние · решения · контроллеры</span></div><div className="t-architecture-link">общее состояние через Kubernetes API <Arrow vertical /></div><div className="t-architecture-workers"><strong>Рабочие узлы</strong><div><Node name="node-1" compact /><Node name="node-2" compact /><Node name="node-3" compact /></div></div></div>} />,
    notes: 'Control Plane предоставляет API, сохраняет состояние, размещает Pod и выполняет управляющие циклы. Рабочие узлы дают ресурсы и обеспечивают выполнение. Это разделение ответственности, а не требование разместить всё управление на одном сервере.', source: sources.architecture,
  },
  {
    nav: 'Роли Control Plane', title: <>У каждого компонента Control Plane своя работа</>,
    visual: <div className="t-roles"><div><b>kube-apiserver</b><span>принимает запросы и открывает доступ к объектам</span></div><div><b>etcd</b><span>сохраняет состояние API</span></div><div><b>kube-scheduler</b><span>выбирает узел для Pod</span></div><div><b>controller-manager</b><span>выполняет циклы согласования</span></div><div><b>cloud-controller-manager</b><span>связывает кластер с облаком, если это нужно</span></div></div>,
    notes: 'Запоминайте роли, а не список названий. API server предоставляет интерфейс. Etcd сохраняет данные. Scheduler выбирает узел. Controller Manager содержит встроенные контроллеры. Cloud Controller Manager нужен для интеграции с облачной инфраструктурой и не обязателен в каждой конфигурации.', source: sources.architecture,
  },
  {
    nav: 'API server', title: <>API server проверяет изменение до сохранения</>,
    visual: <div className="t-gates"><div><span>Запрос</span><strong>kubectl apply</strong></div><Arrow /><div><span>1</span><strong>Кто обращается?</strong><small>Аутентификация</small></div><Arrow /><div><span>2</span><strong>Что разрешено?</strong><small>Авторизация</small></div><Arrow /><div><span>3</span><strong>Допустим ли объект?</strong><small>Admission</small></div></div>,
    notes: 'Команда администратора становится запросом к API. Перед сохранением система проверяет личность, права и допустимость объекта. Успешный ответ API означает принятие изменения, но не готовность приложения принимать трафик.', source: sources.api,
  },
  {
    nav: 'etcd', title: <>etcd помнит объекты кластера, а не файлы приложения</>,
    visual: <div className="t-storage"><div><strong>etcd</strong><span>Объекты Kubernetes API</span><small>Deployment, Pod, Service</small></div><div><strong>Registry</strong><span>Образы контейнеров</span><small>Ссылка на образ хранится в Pod</small></div><div><strong>Тома и БД</strong><span>Данные приложения</span><small>Нужна своя стратегия резервирования</small></div></div>,
    notes: 'etcd хранит данные Kubernetes API. Сам образ контейнера живёт в registry, а содержимое томов и баз данных отдельно. Резервная копия etcd не заменяет резервное копирование пользовательских данных.', source: sources.etcd,
  },
  {
    nav: 'Контроллеры', title: <>Удалённый Pod появляется снова, потому что число реплик не изменилось</>,
    visual: <ReplicaScene />,
    notes: 'Deployment controller управляет ReplicaSet. ReplicaSet controller поддерживает подходящий набор Pod. Удаление одного Pod при replicas: 3 создаёт расхождение. После клика появляется новый Pod с новым именем и UID. Для уменьшения числа экземпляров нужно изменить желаемое количество.', source: sources.deployments,
  },
  {
    nav: 'Scheduler', title: <>Scheduler выбирает узел, но не запускает контейнер</>,
    visual: <SchedulerScene />,
    notes: 'Scheduler наблюдает Pod без назначенного узла. Сначала он исключает неподходящие узлы, затем оценивает оставшиеся и назначает один. Учитываются ресурсные requests и ограничения. Запуск обеспечивает kubelet выбранного узла.', source: sources.scheduler,
  },
  {
    nav: 'Облако', title: <>Облачная интеграция вынесена в отдельный компонент</>,
    visual: <Flow className="t-cloud"><Item tone="control" sub="объект Service">Kubernetes API</Item><Arrow /><Item sub="адаптер провайдера">Cloud Controller Manager</Item><Arrow /><Item tone="control" sub="балансировщик, маршруты">Cloud API</Item></Flow>,
    notes: 'Cloud Controller Manager связывает общую модель Kubernetes с API конкретной платформы. Он может участвовать в учёте облачных узлов, маршрутах и балансировщиках. В локальном кластере без соответствующей интеграции компонент может отсутствовать.', source: sources.cloud,
  },
  {
    nav: 'Рабочий узел', mode: 'split', title: <>На рабочем узле есть свой агент и runtime</>,
    lead: 'Узел предоставляет ресурсы и выполняет назначенные ему Pod.',
    visual: <div className="t-cutaway"><div><span>Pod приложений</span><Pod /><Pod /></div><div><span>kubelet</span><span>container runtime</span></div><div><span>ОС и сеть</span></div><div><span>CPU</span><span>RAM</span><span>Диск</span><span>NIC</span></div></div>,
    notes: 'Рабочий узел не просто сервер с контейнерами. На нём есть операционная система, runtime, kubelet и сетевые компоненты. Объект Node отражает ресурсы и состояние машины в API.', source: sources.nodes,
  },
  {
    nav: 'kubelet', title: <>kubelet обеспечивает выполнение Pod на своём узле</>,
    visual: <KubeletGraph fallback={<div className="t-kubelet"><Flow><Item tone="control" sub="назначенный PodSpec">Kubernetes API</Item><Arrow /><Item tone="control" sub="узловой агент">kubelet</Item><Arrow /><Item tone="work" sub="контейнеры">runtime</Item></Flow><div className="t-feedback">Состояние и результаты проверок возвращаются в API</div></div>} />,
    notes: 'Kubelet получает спецификации Pod, назначенных этому узлу, взаимодействует с runtime, следит за выполнением и сообщает статус через API. Он не выбирает другие машины для размещения.', source: sources.kubelet,
  },
  {
    nav: 'Runtime и CRI', title: <>CRI отделяет kubelet от конкретного runtime</>,
    visual: <div className="t-cri"><Item tone="control">kubelet</Item><div className="t-cri-interface">CRI<span>стандартный интерфейс</span></div><div className="t-cri-options"><Item tone="work">containerd</Item><span>или</span><Item tone="work">CRI-O</Item></div><Arrow /><Pod name="работает" /></div>,
    notes: 'CRI задаёт интерфейс между kubelet и runtime. Поддерживаются разные реализации, например containerd и CRI-O. Docker Engine не обязателен, хотя образы, собранные Docker, могут запускаться совместимым runtime.', source: sources.cri,
  },
  {
    nav: 'Сеть', title: <>Сеть решает три отдельные задачи</>,
    visual: <div className="t-network"><div><b>CNI</b><strong>Подключает Pod к сети</strong><span>У Pod появляется сетевое окружение</span></div><div><b>Service</b><strong>Даёт стабильную точку доступа</strong><span>Правила ведут к подходящим Pod</span></div><div><b>DNS</b><strong>Находит Service по имени</strong><span>Клиенту не нужно помнить IP</span></div></div>,
    notes: 'CNI участвует в настройке сети Pod. Service даёт устойчивую точку доступа. kube-proxy наблюдает Service и EndpointSlice и настраивает сетевые правила; в типичных Linux-режимах пакет не проходит через процесс kube-proxy. DNS разрешает имя Service. Возможны реализации без kube-proxy.', source: sources.network,
  },
  {
    nav: 'Проверки здоровья', title: <>Запущенный процесс ещё не готов принимать запросы</>,
    visual: <div className="t-probes"><div><b>Startup</b><strong>Запуск завершился?</strong><span>дать приложению время подняться</span></div><div><b>Readiness</b><strong>Можно направлять трафик?</strong><span>убрать неготовый Pod из конечных точек</span></div><div><b>Liveness</b><strong>Нужен перезапуск?</strong><span>реакция на зависший контейнер</span></div></div>,
    notes: 'Startup проверяет завершение начальной загрузки. Readiness определяет допуск к трафику. Liveness помогает решить, нужен ли перезапуск. Неуспешная readiness сама по себе не перезапускает контейнер.', source: sources.probes,
  },
  {
    nav: 'После kubectl apply', title: <>После kubectl apply компоненты действуют через API</>,
    visual: <ApplyGraph fallback={<div className="t-sequence"><div><b>1</b><strong>API принимает Deployment</strong></div><div><b>2</b><strong>Контроллеры создают ReplicaSet и Pod</strong></div><div><b>3</b><strong>Scheduler назначает узел</strong></div><div><b>4</b><strong>kubelet запускает Pod через runtime</strong></div></div>} />,
    notes: 'API принимает и сохраняет Deployment. Deployment controller создаёт ReplicaSet, тот создаёт объекты Pod. Scheduler назначает узлы. Kubelet обеспечивает запуск через runtime, затем обновляется статус. Это асинхронные циклы наблюдения через Kubernetes API, а не цепочка прямых вызовов.', source: sources.deployments,
  },
  {
    nav: 'Два пути', title: <>HTTP-запрос не проходит через API server</>,
    visual: <TrafficGraph fallback={<div className="t-paths"><div><b>Управление</b><span>kubectl</span><Arrow /><span>API server</span><Arrow /><span>объекты</span></div><div><b>Трафик</b><span>клиент</span><Arrow /><span>сетевая точка доступа</span><Arrow /><span>Pod</span></div></div>} />,
    notes: 'Команда развёртывания и обычный HTTP-запрос идут разными путями. API server управляет объектами. Пользовательский трафик доставляется сетевыми механизмами к приложению. DNS помогает получить адрес, но не находится посередине каждого HTTP-запроса.', source: sources.service,
  },
  {
    nav: 'Три сбоя', title: <>На разных уровнях сбоя действуют разные механизмы</>,
    visual: <div className="t-failures"><div><b>Контейнер завершился</b><span>kubelet может перезапустить его в том же Pod</span></div><div><b>Pod удалён</b><span>контроллер создаёт новый Pod</span></div><div><b>Узел отказал</b><span>после обнаружения создаётся и размещается замена</span></div></div>,
    notes: 'При сбое контейнера kubelet может перезапустить контейнер. При удалении управляемого Pod контроллер создаёт новый. При отказе узла требуются обнаружение, действия контроллеров и новое размещение. Старый Pod не мигрирует между машинами. Восстановление зависит от доступных ресурсов.', source: sources.lifecycle,
  },
  {
    nav: 'Control Plane недоступен', title: <>Приложения могут работать без доступного Control Plane</>,
    lead: 'Но новые изменения и полноценное восстановление будут ограничены.',
    visual: <PlaneLossScene />,
    notes: 'Работающие Pod и уже настроенные сетевые пути могут продолжать обслуживать запросы без API server, если не зависят от него напрямую. Но изменять объекты, размещать новые Pod и полноценно восстанавливаться становится невозможно. Это не абсолютная гарантия доступности.', source: sources.architecture,
  },
  {
    nav: 'Кворум etcd', title: <>etcd может согласовывать изменения, пока есть большинство</>,
    visual: <QuorumScene />,
    notes: 'Для трёх участников etcd нужны два. Начальное состояние на схеме: один недоступен, два остались, кворум есть. После клика отключается второй, остаётся один из трёх, кворума нет. В группе из пяти нужен кворум три. Это участники etcd, а не рабочие узлы.', source: sources.raft,
  },
  {
    nav: 'Итог', title: <>Восстановление создаёт цепочка компонентов</>,
    visual: <RecoveryTimeline />,
    notes: 'Вернитесь к первому вопросу. Узел отказывает. Контроллеры создают замену управляемой нагрузки, scheduler выбирает узел, kubelet и runtime обеспечивают запуск. Сетевые механизмы исключают недоступные конечные точки и ведут трафик к готовым Pod. Не обещайте мгновенного восстановления. Финальная мысль: Kubernetes обнаруживает расхождение с заданным состоянием и пытается его устранить.', source: sources.controllers,
  },
];

const appendix: Page[] = [
  { nav: 'Резерв: распределение', title: 'Три Pod на одном узле разделяют один риск', visual: <div className="t-spread"><div><Node name="node-1" count={3} /><span>Один отказ затрагивает все реплики</span></div><div><Node name="node-1" /><Node name="node-2" /><Node name="node-3" /><span>Реплики распределены по узлам</span></div></div>, notes: 'Количество реплик и распределение по доменам отказа это разные требования. topologySpreadConstraints позволяют описать распределение по узлам или зонам.', source: sources.spread },
  { nav: 'Резерв: Static Pods', title: 'kubelet может запустить системный Pod из локального файла', visual: <Flow><Item sub="static Pod">локальный манифест</Item><Arrow /><Item tone="control">kubelet</Item><Arrow /><Item tone="work">компонент запущен</Item></Flow>, notes: 'Static Pod описан локальным манифестом, который читает kubelet. Для такого Pod не требуется обычное назначение scheduler. Это один из способов запуска отдельных управляющих компонентов.', source: sources.static },
  { nav: 'Резерв: requests', title: 'Низкая загрузка CPU не означает место для нового Pod', visual: <div className="t-requests"><div><span>Используется сейчас</span><strong>0,5 / 4 CPU</strong></div><div><span>Уже запрошено Pod</span><strong>3,5 / 4 CPU</strong></div><p>Новый Pod просит 1 CPU. 3,5 + 1 больше 4.</p></div>, notes: 'Scheduler учитывает resource requests уже размещённых Pod, а не только их текущую фактическую загрузку. В примере 3,5 CPU уже заявлены, новый Pod просит ещё 1, но ёмкость узла 4 CPU.', source: sources.resources },
  { nav: 'Источники', title: 'Основные источники', visual: <div className="t-sources"><a href={sources.architecture}>Kubernetes Components ↗</a><a href={sources.controllers}>Controllers ↗</a><a href={sources.scheduler}>Kubernetes Scheduler ↗</a><a href={sources.nodes}>Nodes ↗</a><a href={sources.service}>Service ↗</a><a href={sources.probes}>Startup, Readiness, Liveness ↗</a><a href={sources.raft}>etcd FAQ ↗</a></div>, notes: 'Служебный слайд. Ссылки ведут на официальную документацию Kubernetes и etcd.', source: sources.architecture },
];

function PageSlide({ page, index }: { page: Page; index: number; nav?: string; notes?: string }) {
  return <Slide nav={page.nav} notes={page.notes} className={'t-slide t-mode-' + (page.mode || 'diagram')}>
    <div className="t-page"><div className="t-heading"><h1>{page.title}</h1>{page.lead && <p>{page.lead}</p>}</div><div className="t-visual">{page.visual}</div></div>
    {index === 21 && <p className="t-closing">Kubernetes обнаруживает расхождение с заданным состоянием и пытается его устранить.</p>}
    <a className="t-source" href={page.source} target="_blank" rel="noreferrer">Источник ↗</a>
  </Slide>;
}

export default function App() {
  return <Deck>{[...pages, ...appendix].map((page, index) => <PageSlide key={index} page={page} index={index} nav={page.nav} notes={page.notes} />)}</Deck>;
}
