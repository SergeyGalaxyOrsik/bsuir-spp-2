'use client'

import type { SessionDto, UserDto } from '@lab2/contract'
import { useState } from 'react'
import { toast } from 'sonner'
import { SessionList } from '@/components/session-list'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminRevokeSession, useAdminUserSessions } from '@/hooks/use-sessions'
import { describeError } from '@/lib/errors'

type AdminUserSessionsDialogProps = { user: UserDto | null; onClose: () => void }

export function AdminUserSessionsDialog({ user, onClose }: AdminUserSessionsDialogProps) {
  const sessions = useAdminUserSessions(user?.id ?? null)
  const revoke = useAdminRevokeSession(user?.id ?? '')
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const terminate = async (session: SessionDto) => {
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

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sessions of {user?.name}</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        {sessions.isPending && <Skeleton className="h-32 w-full" />}
        {sessions.isError && <p className="text-sm text-destructive">{describeError(sessions.error).message}</p>}
        {sessions.data && <SessionList sessions={sessions.data} onRevoke={terminate} revokingId={revokingId} />}
      </DialogContent>
    </Dialog>
  )
}
