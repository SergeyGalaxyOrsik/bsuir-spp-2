'use client'

import { roleSchema, type Role, type UserDto } from '@lab2/contract'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AdminUserSessionsDialog } from '@/components/admin-user-sessions-dialog'
import { useCurrentUser } from '@/components/auth-provider'
import { PromptGridError } from '@/components/prompt-grid-states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminUsers, useUpdateUserRole, useUpdateUserStatus } from '@/hooks/use-sessions'
import { describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'

const ROLE_ITEMS = roleSchema.options.map((role) => ({ value: role, label: role[0]!.toUpperCase() + role.slice(1) }))

export default function AdminUsersPage() {
  const currentUser = useCurrentUser()
  const router = useRouter()
  const users = useAdminUsers()
  const updateRole = useUpdateUserRole()
  const updateStatus = useUpdateUserStatus()
  const [inspected, setInspected] = useState<UserDto | null>(null)
  const isAdmin = currentUser.role === 'admin'

  useEffect(() => {
    if (!isAdmin) router.replace('/')
  }, [isAdmin, router])

  const changeRole = async (user: UserDto, role: Role) => {
    try {
      await updateRole.mutateAsync({ id: user.id, role })
      toast.success(`${user.name} is now ${role}`)
    } catch (error) {
      toast.error(describeError(error).message)
    }
  }

  const toggleStatus = async (user: UserDto) => {
    const status = user.status === 'active' ? 'blocked' : 'active'
    try {
      await updateStatus.mutateAsync({ id: user.id, status })
      toast.success(status === 'blocked' ? `${user.name} was blocked` : `${user.name} was unblocked`)
    } catch (error) {
      toast.error(describeError(error).message)
    }
  }

  if (!isAdmin) return null

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">Manage roles, access and active sessions.</p>
      </div>
      {users.isPending && <Skeleton className="h-64 w-full" />}
      {users.isError && (
        <PromptGridError title="Could not load users" message={describeError(users.error).message} onRetry={() => users.refetch()} />
      )}
      {users.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.data.map((user) => {
              const isSelf = user.id === currentUser.id
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      items={ROLE_ITEMS}
                      value={user.role}
                      onValueChange={(role) => role && changeRole(user, role as Role)}
                      disabled={isSelf}
                    >
                      <SelectTrigger className="w-32" aria-label={`Role of ${user.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.status === 'active' ? 'secondary' : 'destructive'} className="capitalize">
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => setInspected(user)}>
                      Sessions
                    </Button>
                    <Button variant="outline" size="sm" disabled={isSelf} onClick={() => toggleStatus(user)}>
                      {user.status === 'active' ? 'Block' : 'Unblock'}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      <AdminUserSessionsDialog user={inspected} onClose={() => setInspected(null)} />
    </div>
  )
}
