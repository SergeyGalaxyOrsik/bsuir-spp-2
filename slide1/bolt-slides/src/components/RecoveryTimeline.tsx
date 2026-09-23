import '../styles/recovery-timeline.css';

const steps = [
  { number: '01', icon: 'c-m', role: 'Контроллер', action: 'Создаёт новый Pod', artifact: 'Pod · Pending' },
  { number: '02', icon: 'sched', role: 'Scheduler', action: 'Выбирает node-2', artifact: 'Pod · Assigned' },
  { number: '03', icon: 'kubelet', role: 'kubelet + runtime', action: 'Запускают контейнер', artifact: 'Pod · Running' },
];

export default function RecoveryTimeline() {
  return (
    <div className="recovery-timeline" role="img" aria-label="После отказа node-1 контроллер создаёт новый Pod, scheduler назначает node-2, kubelet запускает контейнер. После проверки готовности Service направляет трафик к новому Pod.">
      <div className="recovery-track">
        <div className="recovery-failure">
          <span className="recovery-kicker">СБОЙ</span>
          <div className="recovery-failure-title">
            <img src="/k8s-icons/node.svg" alt="" />
            <strong>node-1</strong>
          </div>
          <p>Узел недоступен.<br />Один Pod потерян.</p>
        </div>
        {steps.map((step) => (
          <div className="recovery-step" key={step.number}>
            <span className="recovery-number">{step.number}</span>
            <img src={`/k8s-icons/${step.icon}.svg`} alt="" />
            <strong>{step.role}</strong>
            <p>{step.action}</p>
            <span className="recovery-artifact">{step.artifact}</span>
          </div>
        ))}
      </div>
      <div className="recovery-result">
        <div className="recovery-result-icon"><img src="/k8s-icons/pod.svg" alt="" /></div>
        <div>
          <span className="recovery-kicker">РЕЗУЛЬТАТ</span>
          <strong>Новый Pod на node-2 готов</strong>
          <p>Service направляет к нему запросы после readiness.</p>
        </div>
        <span className="recovery-ready">3 / 3 Pod</span>
      </div>
    </div>
  );
}
