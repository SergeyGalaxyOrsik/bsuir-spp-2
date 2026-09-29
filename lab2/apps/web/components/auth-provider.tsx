'use client'

import type { UserDto } from '@lab2/contract'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { client, refreshSession } from '@/lib/api'
import { SESSION_EXPIRED_EVENT, setAccessToken } from '@/lib/auth-token'

type AuthState = { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: UserDto }

type AuthContextValue = {
  state: AuthState
  login: (input: { email: string; password: string }) => Promise<void>
  register: (input: { email: string; name: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const wasAuthenticated = useRef(false)

  const startSession = useCallback((result: { accessToken: string; user: UserDto }) => {
    setAccessToken(result.accessToken)
    wasAuthenticated.current = true
    setState({ status: 'authenticated', user: result.user })
  }, [])

  const endSession = useCallback(() => {
    setAccessToken(null)
    queryClient.clear()
    wasAuthenticated.current = false
    setState({ status: 'anonymous' })
  }, [queryClient])

  useEffect(() => {
    refreshSession().then((result) => (result ? startSession(result) : endSession()))
  }, [startSession, endSession])

  useEffect(() => {
    const handleExpired = () => {
      if (wasAuthenticated.current) toast.error('Your session has expired. Please log in again.')
      endSession()
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired)
  }, [endSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (input) => startSession(await client.auth.login(input)),
      register: async (input) => startSession(await client.auth.register(input)),
      logout: async () => {
        await client.auth.logout().catch(() => undefined)
        endSession()
      },
    }),
    [state, startSession, endSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

export function useCurrentUser() {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('useCurrentUser requires an authenticated user')
  return state.user
}
