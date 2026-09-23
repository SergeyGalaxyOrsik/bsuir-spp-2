import type { ReactNode } from 'react';
import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../styles/architecture-graph.css';

type GraphTone = 'control' | 'work' | 'error' | 'warn' | 'quiet';
type GraphData = Record<string, unknown> & {
  title: string;
  subtitle?: string;
  icon?: string;
  tag?: string;
  tone?: GraphTone;
};
type GraphNode = Node<GraphData>;

const icon = (name: string) => `/k8s-icons/${name}.svg`;

function ComponentNode({ data }: NodeProps<GraphNode>) {
  const tone = data.tone || 'quiet';
  return (
    <div className={`arch-node arch-${tone}`}>
      <Handle id="in-left" type="target" position={Position.Left} />
      <Handle id="in-top" type="target" position={Position.Top} />
      <Handle id="out-right" type="source" position={Position.Right} />
      <Handle id="out-bottom" type="source" position={Position.Bottom} />
      {data.icon && <img className="arch-icon" src={icon(data.icon)} alt="" />}
      <div className="arch-node-copy">
        <strong>{data.title}</strong>
        {data.subtitle && <span>{data.subtitle}</span>}
      </div>
      {data.tag && <em>{data.tag}</em>}
    </div>
  );
}

function ZoneNode({ data }: NodeProps<GraphNode>) {
  return (
    <div className={`arch-zone arch-${data.tone || 'quiet'}`}>
      <strong>{data.title}</strong>
      {data.subtitle && <span>{data.subtitle}</span>}
    </div>
  );
}

const nodeTypes = { component: ComponentNode, zone: ZoneNode };

function node(
  id: string,
  x: number,
  y: number,
  title: string,
  options: Partial<GraphData> & { width?: number; parentId?: string } = {}
): GraphNode {
  const { width = 260, parentId, ...data } = options;
  return {
    id,
    type: 'component',
    position: { x, y },
    parentId,
    data: { title, ...data },
    style: { width },
    draggable: false,
    selectable: false,
  };
}

function zone(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  tone: GraphTone,
  subtitle?: string
): GraphNode {
  return {
    id,
    type: 'zone',
    position: { x, y },
    data: { title, tone, subtitle },
    style: { width, height },
    draggable: false,
    selectable: false,
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  tone: GraphTone = 'control'
): Edge {
  const color = tone === 'work' ? 'var(--work)' : tone === 'error' ? 'var(--danger)' : 'var(--control)';
  return {
    id,
    source,
    target,
    sourceHandle: 'out-right',
    targetHandle: 'in-left',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 20, height: 20 },
    style: { stroke: color, strokeWidth: 2.5 },
  };
}

function Graph({
  nodes,
  edges,
  summary,
  fallback,
  className = '',
}: {
  nodes: GraphNode[];
  edges: Edge[];
  summary: string;
  fallback: ReactNode;
  className?: string;
}) {
  return (
    <div className={`arch-figure ${className}`}>
      <div className="arch-canvas" role="img" aria-label={summary}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.05, maxZoom: 1.24 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          selectionOnDrag={false}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        />
      </div>
      <div className="arch-fallback">{fallback}</div>
    </div>
  );
}

export function ClusterArchitectureGraph({ fallback }: { fallback: ReactNode }) {
  const nodes: GraphNode[] = [
    zone('plane', 0, 0, 1330, 190, 'CONTROL PLANE', 'control', 'Хранит состояние и принимает решения'),
    zone('workers', 0, 255, 1330, 212, 'РАБОЧИЕ УЗЛЫ', 'work', 'Исполняют назначенные Pod'),
    node('api', 30, 59, 'API server', { parentId: 'plane', icon: 'api', tone: 'control', subtitle: 'объекты и запросы', width: 285 }),
    node('etcd', 355, 59, 'etcd', { parentId: 'plane', icon: 'etcd', tone: 'control', subtitle: 'состояние API', width: 285 }),
    node('controller', 680, 59, 'Controllers', { parentId: 'plane', icon: 'c-m', tone: 'control', subtitle: 'согласование', width: 285 }),
    node('scheduler', 1005, 59, 'Scheduler', { parentId: 'plane', icon: 'sched', tone: 'control', subtitle: 'размещение', width: 285 }),
    node('worker1', 38, 69, 'node-1', { parentId: 'workers', icon: 'node', tone: 'work', subtitle: 'kubelet · runtime', tag: 'web Pod', width: 385 }),
    node('worker2', 472, 69, 'node-2', { parentId: 'workers', icon: 'node', tone: 'work', subtitle: 'kubelet · runtime', tag: 'web Pod', width: 385 }),
    node('worker3', 906, 69, 'node-3', { parentId: 'workers', icon: 'node', tone: 'work', subtitle: 'kubelet · runtime', tag: 'web Pod', width: 385 }),
  ];
  return <Graph nodes={nodes} edges={[]} summary="Control Plane с API server, etcd, контроллерами и scheduler связан через API с рабочими узлами. На узлах kubelet и runtime исполняют Pod." fallback={fallback} className="arch-cluster" />;
}

export function ReplicaGraph({ recovered, fallback }: { recovered: boolean; fallback: ReactNode }) {
  const nodes: GraphNode[] = [
    node('deployment', 30, 130, 'Deployment', { icon: 'deploy', tone: 'control', subtitle: 'replicas: 3', width: 300 }),
    node('rs', 470, 130, 'ReplicaSet', { icon: 'rs', tone: 'control', subtitle: 'поддерживает Pod', width: 300 }),
    node('pod1', 930, 0, 'web-a', { icon: 'pod', tone: 'work', subtitle: 'работает', width: 270 }),
    node('pod2', 930, 130, 'web-b', { icon: 'pod', tone: 'work', subtitle: 'работает', width: 270 }),
    node('pod3', 930, 260, recovered ? 'web-new' : 'третий Pod', {
      icon: recovered ? 'pod' : undefined,
      tone: recovered ? 'work' : 'warn',
      subtitle: recovered ? 'создан взамен удалённого' : 'удалён · ожидает замены',
      width: 270,
    }),
  ];
  const edges = [
    edge('d-rs', 'deployment', 'rs'),
    edge('rs-p1', 'rs', 'pod1', 'work'),
    edge('rs-p2', 'rs', 'pod2', 'work'),
    edge('rs-p3', 'rs', 'pod3', recovered ? 'work' : 'control'),
  ];
  return <Graph nodes={nodes} edges={edges} summary="Deployment управляет ReplicaSet, ReplicaSet поддерживает три Pod. Удалённый третий Pod заменяется новым." fallback={fallback} className="arch-replica" />;
}

export function KubeletGraph({ fallback }: { fallback: ReactNode }) {
  const nodes: GraphNode[] = [
    node('api', 0, 55, 'Kubernetes API', { icon: 'api', tone: 'control', subtitle: 'назначенный PodSpec', width: 280 }),
    node('kubelet', 360, 55, 'kubelet', { icon: 'kubelet', tone: 'control', subtitle: 'агент на узле', width: 280 }),
    node('runtime', 720, 55, 'container runtime', { tone: 'work', subtitle: 'containerd / CRI-O', width: 280 }),
    node('pod', 1080, 55, 'Pod web', { icon: 'pod', tone: 'work', subtitle: 'контейнер работает', width: 280 }),
  ];
  const edges = [
    edge('api-k', 'api', 'kubelet'),
    edge('k-r', 'kubelet', 'runtime'),
    edge('r-p', 'runtime', 'pod', 'work'),
  ];
  return <Graph nodes={nodes} edges={edges} summary="Kubernetes API передаёт PodSpec kubelet, kubelet через CRI обращается к runtime, runtime запускает Pod." fallback={fallback} className="arch-kubelet" />;
}

export function ApplyGraph({ fallback }: { fallback: ReactNode }) {
  const nodes: GraphNode[] = [
    node('deploy', 0, 65, 'Deployment', { icon: 'deploy', tone: 'control', subtitle: 'принят API', width: 290 }),
    node('rs', 365, 65, 'ReplicaSet', { icon: 'rs', tone: 'control', subtitle: 'создаёт Pod', width: 290 }),
    node('assigned', 730, 65, 'Pod назначен', { icon: 'pod', tone: 'warn', subtitle: 'scheduler выбрал узел', width: 290 }),
    node('running', 1095, 65, 'Pod работает', { icon: 'pod', tone: 'work', subtitle: 'kubelet / runtime запустили', width: 290 }),
  ];
  const edges = [
    edge('d-r', 'deploy', 'rs'),
    edge('r-a', 'rs', 'assigned'),
    edge('a-r', 'assigned', 'running', 'work'),
  ];
  return <Graph nodes={nodes} edges={edges} summary="Через Kubernetes API Deployment приводит к ReplicaSet и Pod, scheduler назначает узел, kubelet и runtime запускают Pod." fallback={fallback} className="arch-apply" />;
}

export function TrafficGraph({ fallback }: { fallback: ReactNode }) {
  const nodes: GraphNode[] = [
    zone('management', 0, 0, 1360, 190, 'ПУТЬ УПРАВЛЕНИЯ', 'control', 'Изменение объектов кластера'),
    zone('traffic', 0, 235, 1360, 190, 'ПУТЬ ЗАПРОСА', 'work', 'Доставка HTTP к приложению'),
    node('kubectl', 32, 66, 'kubectl', { parentId: 'management', tone: 'control', subtitle: 'команда', width: 315 }),
    node('api', 520, 66, 'API server', { parentId: 'management', icon: 'api', tone: 'control', subtitle: 'проверка и запись', width: 315 }),
    node('objects', 1012, 66, 'Объекты API', { parentId: 'management', icon: 'deploy', tone: 'control', subtitle: 'желаемое состояние', width: 315 }),
    node('client', 32, 66, 'Клиент', { parentId: 'traffic', tone: 'work', subtitle: 'HTTP-запрос', width: 315 }),
    node('service', 520, 66, 'Service', { parentId: 'traffic', icon: 'svc', tone: 'work', subtitle: 'точка доступа', width: 315 }),
    node('pod', 1012, 66, 'Ready Pod', { parentId: 'traffic', icon: 'pod', tone: 'work', subtitle: 'обрабатывает запрос', width: 315 }),
  ];
  const edges = [
    edge('k-a', 'kubectl', 'api'),
    edge('a-o', 'api', 'objects'),
    edge('c-s', 'client', 'service', 'work'),
    edge('s-p', 'service', 'pod', 'work'),
  ];
  return <Graph nodes={nodes} edges={edges} summary="Управление: kubectl обращается к API server, который меняет объекты. Пользовательский трафик: клиент обращается к Service, который доставляет запрос к готовому Pod." fallback={fallback} className="arch-traffic" />;
}
