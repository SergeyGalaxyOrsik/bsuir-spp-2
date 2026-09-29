import type { ReactNode } from 'react'
import { AppHeader } from '@/components/app-header'
import { AuthGate } from '@/components/auth-gates'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </AuthGate>
  )
}
