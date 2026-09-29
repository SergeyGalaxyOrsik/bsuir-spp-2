'use client'

import { emailSchema } from '@lab2/contract'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AuthCard } from '@/components/auth-card'
import { useAuth } from '@/components/auth-provider'
import { FormField } from '@/components/form-field'
import { RootError } from '@/components/root-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyServerError } from '@/lib/form-errors'

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

type Values = z.infer<typeof schema>

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values)
      router.replace('/')
    } catch (error) {
      applyServerError(error, setError)
    }
  })

  return (
    <AuthCard
      title="Welcome back"
      description="Log in to your prompt library"
      footer={
        <span>
          No account?{' '}
          <Link href="/register" className="text-foreground underline underline-offset-4">
            Sign up
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <RootError message={errors.root?.server?.message} />
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <Link href="/forgot-password" className="text-sm text-muted-foreground underline underline-offset-4">
          Forgot your password?
        </Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </Button>
      </form>
    </AuthCard>
  )
}
