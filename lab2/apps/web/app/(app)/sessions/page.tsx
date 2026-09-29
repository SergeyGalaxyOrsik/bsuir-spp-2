'use client'

import type { SessionDto } from '@lab2/contract'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-provider'
import { PromptGridError } from '@/components/prompt-grid-states'
import { SessionList } from '@/components/session-list'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMySessions, useRevokeMySession } from '@/hooks/use-sessions'
import { client } from '@/lib/api'
import { describeError } from '@/lib/errors'

export default function SessionsPage() {
  const { logout } = useAuth()
  const sessions = useMySessions()
  const revoke = useRevokeMySession()
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const terminate = async (session: SessionDto) => {
    if (session.current) return logout()
    setRevokingId(session.id)
    try {
      await revoke.mutateAsync(session.id)
      toast.success('Session terminated')
    } catch (error) {
      toast.error(describeError(error).message)
    } finally {
      setRevokingId(null)
    }
  }

  const terminateEverywhere = async () => {
    try {
      await client.auth.logoutAll()
      await logout()
    } catch (error) {
      toast.error(describeError(error).message)
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Active devices</h1>
          <p className="text-sm text-muted-foreground">Up to 5 devices can be signed in at once.</p>
        </div>
        <Button variant="destructive" size="sm" onClick={terminateEverywhere}>
          Log out everywhere
        </Button>
      </div>
      {sessions.isPending && <Skeleton className="h-40 w-full" />}
      {sessions.isError && (
        <PromptGridError title="Could not load devices" message={describeError(sessions.error).message} onRetry={() => sessions.refetch()} />
      )}
      {sessions.data && <SessionList sessions={sessions.data} onRevoke={terminate} revokingId={revokingId} />}
    </div>
  )
}
