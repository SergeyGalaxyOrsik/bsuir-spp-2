'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth, useCurrentUser } from '@/components/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'

export function AppHeader() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Library' },
    { href: '/sessions', label: 'Devices' },
    ...(user.role === 'admin' ? [{ href: '/admin/users', label: 'Users' }] : []),
  ]

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <span className="font-semibold tracking-tight">Prompt Library</span>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={buttonVariants({ variant: pathname === link.href ? 'secondary' : 'ghost', size: 'sm' })}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm sm:inline">{user.name}</span>
          <Badge variant="outline" className="capitalize">
            {user.role}
          </Badge>
          <Button variant="outline" size="sm" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  )
}
