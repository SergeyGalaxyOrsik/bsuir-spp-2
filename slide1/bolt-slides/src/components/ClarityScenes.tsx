import Build from '../deck/Build';
import { useDeck } from '../deck/DeckContext';
import '../styles/clarity-scenes.css';

const k8sIcon = (name: string) => `/k8s-icons/${name}.svg`;

function PodBadge({ name, newPod = false }: { name: string; newPod?: boolean }) {
  return <div className={`clarity-pod-badge${newPod ? ' is-new' : ''}`}>
    <img src={k8sIcon('pod')} alt="" />
    <span>{name}</span>
  </div>;
}

export function ReconcileScene() {
  const { clicks } = useDeck();
  const reconciled = clicks >= 1;

  return <div className={`clarity-reconcile${reconciled ? ' is-reconciled' : ''}`}>
    <div className="clarity-reconcile-main">
      <section className="clarity-state-card">
        <span className="clarity-eyebrow">SPEC / ЖЕЛАЕМОЕ</span>
        <div className="clarity-state-number"><img src={k8sIcon('deploy')} alt="" /><strong>3</strong></div>
        <p>Pod приложения web</p>
      </section>
      <div className="clarity-comparison" aria-label={reconciled ? 'Состояния совпадают' : 'Состояния расходятся'}>
        <strong>{reconciled ? '=' : '≠'}</strong>
        <span>{reconciled ? 'согласовано' : 'не хватает 1 Pod'}</span>
      </div>
      <section className="clarity-state-card clarity-observed">
        <span className="clarity-eyebrow">STATUS / ФАКТИЧЕСКОЕ</span>
        <div className="clarity-observed-count"><strong>{reconciled ? '3' : '2'}</strong><span> / 3 Pod</span></div>
        <div className="clarity-observed-pods">
          <PodBadge name="web-a" />
          <PodBadge name="web-b" />
          <div className="clarity-new-pod-slot">
            {!reconciled && <span className="clarity-missing-pod">Pod отсутствует</span>}
            <Build at={1} y={8}><PodBadge name="web-new" newPod /></Build>
          </div>
        </div>
      </section>
    </div>
    <div className="clarity-loop" aria-label="Цикл согласования: наблюдать, сравнить, исправить, повторить">
      <span><b>01</b> Наблюдать</span>
      <i aria-hidden>→</i>
      <span><b>02</b> Сравнить</span>
      <i aria-hidden>→</i>
      <span><b>03</b> {reconciled ? 'Проверить снова' : 'Создать Pod'}</span>
      <i className="clarity-loop-return" aria-hidden>↺</i>
    </div>
  </div>;
}

function RuntimeTile({ icon, title, role }: { icon: string; title: string; role: string }) {
  return <div className="clarity-runtime">
    <img src={`/tech-icons/${icon}.svg`} alt="" />
    <div><strong>{title}</strong><span>{role}</span></div>
  </div>;
}

export function NestingScene() {
  return <div className="clarity-hierarchy" role="img" aria-label="Один рабочий узел содержит два Pod. В первом Pod два контейнера: приложение Node.js и прокси NGINX. Во втором Pod отдельный контейнер Node.js.">
    <div className="clarity-node-frame">
      <div className="clarity-node-header">
        <img src={k8sIcon('node')} alt="" />
        <div><span className="clarity-eyebrow">01 / МАШИНА</span><strong>Node <em>worker-1</em></strong></div>
        <span className="clarity-node-resources">CPU · RAM · сеть</span>
      </div>
      <div className="clarity-pod-grid">
        <section className="clarity-pod-frame">
          <div className="clarity-pod-header"><img src={k8sIcon('pod')} alt="" /><div><span className="clarity-eyebrow">02 / РАЗМЕЩЕНИЕ</span><strong>Pod A</strong></div></div>
          <div className="clarity-runtime-grid">
            <RuntimeTile icon="nodedotjs" title="web" role="Node.js" />
            <RuntimeTile icon="nginx" title="proxy" role="NGINX" />
          </div>
          <p>Контейнеры делят сеть и размещаются вместе</p>
        </section>
        <section className="clarity-pod-frame">
          <div className="clarity-pod-header"><img src={k8sIcon('pod')} alt="" /><div><span className="clarity-eyebrow">02 / РАЗМЕЩЕНИЕ</span><strong>Pod B</strong></div></div>
          <div className="clarity-runtime-grid"><RuntimeTile icon="nodedotjs" title="web" role="Node.js" /></div>
          <p>Отдельный экземпляр приложения</p>
        </section>
      </div>
    </div>
    <div className="clarity-hierarchy-foot"><span>Node — машина</span><i aria-hidden>›</i><span>Pod — единица размещения</span><i aria-hidden>›</i><span>Контейнер — процесс приложения</span></div>
  </div>;
}

export function PlaneLossScene() {
  return <div className="clarity-plane-loss" role="img" aria-label="Control Plane недоступен: API server и новое размещение не работают. Уже запущенные Pod на рабочих узлах могут продолжать обрабатывать трафик через существующий Service.">
    <div className="clarity-plane-columns">
      <section className="clarity-plane-offline">
        <div className="clarity-plane-heading"><img src={k8sIcon('api')} alt="" /><div><span className="clarity-eyebrow">CONTROL PLANE</span><strong>Недоступен</strong></div></div>
        <div className="clarity-plane-services"><span>API server</span><span>Scheduler</span><span>Controllers</span></div>
        <p>Изменить состояние кластера сейчас нельзя</p>
      </section>
      <section className="clarity-plane-running">
        <div className="clarity-plane-heading"><img src={k8sIcon('node')} alt="" /><div><span className="clarity-eyebrow">WORKER NODES</span><strong>Уже запущенные Pod работают</strong></div></div>
        <div className="clarity-request-route">
          <div className="clarity-route-client"><span>HTTP</span><strong>Клиент</strong></div>
          <span className="clarity-route-arrow" aria-hidden>→</span>
          <div className="clarity-route-service"><img src={k8sIcon('svc')} alt="" /><strong>Service</strong></div>
          <span className="clarity-route-arrow" aria-hidden>→</span>
          <div className="clarity-route-pods"><PodBadge name="web-a" /><PodBadge name="web-b" /><PodBadge name="web-c" /></div>
        </div>
        <p>Существующий сетевой путь может доставлять запросы</p>
      </section>
    </div>
    <div className="clarity-plane-outcomes">
      <div><b className="is-available">●</b><strong>Может продолжаться</strong><span>Обработка запросов работающими Pod</span></div>
      <div><b className="is-unavailable">×</b><strong>Будет ограничено</strong><span>Новые изменения, размещение и восстановление</span></div>
    </div>
  </div>;
}
