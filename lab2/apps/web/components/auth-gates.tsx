'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from './auth-provider'

function FullPageSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-md gap-4 p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/login')
  }, [state.status, router])

  return state.status === 'authenticated' ? children : <FullPageSkeleton />
}

export function GuestGate({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'authenticated') router.replace('/')
  }, [state.status, router])

  return state.status === 'anonymous' ? children : <FullPageSkeleton />
}
