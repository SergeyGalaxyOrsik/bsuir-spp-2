import type { ReactNode } from 'react'
import { GuestGate } from '@/components/auth-gates'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <GuestGate>
      <div className="grid min-h-[100dvh] lg:grid-cols-[1fr_1.1fr]">
        <aside className="hidden flex-col justify-between bg-muted p-12 lg:flex">
          <span className="font-semibold tracking-tight">Prompt Library</span>
          <div className="grid max-w-md gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">Keep your best prompts where the team can find them.</h2>
            <p className="text-muted-foreground">Write once, attach an example, reuse everywhere.</p>
          </div>
        </aside>
        <main className="flex items-center justify-center p-6">{children}</main>
      </div>
    </GuestGate>
  )
}
