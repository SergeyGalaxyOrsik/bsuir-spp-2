import { Badge } from '#/components/ui/badge'
import { STATUS_LABELS } from '#/lib/format'
import type { TaskStatus } from '#/lib/api'

const VARIANT_BY_STATUS = {
  todo: 'outline',
  in_progress: 'secondary',
  done: 'default',
} as const satisfies Record<TaskStatus, 'outline' | 'secondary' | 'default'>

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={VARIANT_BY_STATUS[status]}>{STATUS_LABELS[status]}</Badge>
}

export function OverdueBadge() {
  return <Badge variant="destructive">Просрочено</Badge>
}
