import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client } from '@/lib/api'

const mySessionsKey = ['sessions', 'mine'] as const
const adminUserSessionsKey = (userId: string) => ['admin', 'sessions', userId] as const
const adminUsersKey = ['admin', 'users'] as const

export function useMySessions() {
  return useQuery({ queryKey: mySessionsKey, queryFn: () => client.auth.sessions.list() })
}

export function useRevokeMySession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => client.auth.sessions.revoke({ id: sessionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mySessionsKey }),
  })
}

export function useAdminUsers() {
  return useQuery({ queryKey: adminUsersKey, queryFn: () => client.admin.users.list() })
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; role: 'user' | 'moderator' | 'admin' }) => client.admin.users.updateRole(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUsersKey }),
  })
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; status: 'active' | 'blocked' }) => client.admin.users.updateStatus(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUsersKey }),
  })
}

export function useAdminUserSessions(userId: string | null) {
  return useQuery({
    queryKey: adminUserSessionsKey(userId ?? ''),
    queryFn: () => client.admin.users.sessions({ id: userId ?? '' }),
    enabled: userId !== null,
  })
}

export function useAdminRevokeSession(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => client.admin.sessions.revoke({ id: sessionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUserSessionsKey(userId) }),
  })
}
