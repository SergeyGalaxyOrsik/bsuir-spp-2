import type { SessionDto } from '@lab2/contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { describeUserAgent } from '@/lib/user-agent'

type SessionListProps = {
  sessions: SessionDto[]
  onRevoke: (session: SessionDto) => void
  revokingId: string | null
}

export function SessionList({ sessions, onRevoke, revokingId }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No active sessions.</p>
  }

  return (
    <ul className="divide-y rounded-lg border">
      {sessions.map((session) => (
        <li key={session.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{describeUserAgent(session.userAgent)}</span>
              {session.current && <Badge>This device</Badge>}
            </div>
            <span className="text-sm text-muted-foreground">
              {session.ip || 'Unknown IP'}, signed in {formatDateTime(session.createdAt)}, active {formatDateTime(session.lastUsedAt)}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={revokingId === session.id}
            onClick={() => onRevoke(session)}
          >
            {session.current ? 'Log out' : 'Terminate'}
          </Button>
        </li>
      ))}
    </ul>
  )
}
