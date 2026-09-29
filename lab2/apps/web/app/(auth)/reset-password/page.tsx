'use client'

import { passwordSchema } from '@lab2/contract'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthCard } from '@/components/auth-card'
import { FormField } from '@/components/form-field'
import { RootError } from '@/components/root-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { client } from '@/lib/api'
import { applyServerError } from '@/lib/form-errors'

const schema = z
  .object({ password: passwordSchema, confirmation: z.string() })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'Passwords do not match',
  })

type Values = z.infer<typeof schema>

function ResetPasswordForm() {
  const token = useSearchParams().get('token')
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await client.auth.password.reset({ token: token ?? '', password })
      toast.success('Password updated. Log in with your new password.')
      router.replace('/login')
    } catch (error) {
      applyServerError(error, setError, { fieldAliases: { token: 'password' } })
    }
  })

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertDescription>This reset link is incomplete. Request a new one.</AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <RootError message={errors.root?.server?.message} />
      <FormField id="password" label="New password (8 to 72 characters)" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
      </FormField>
      <FormField id="confirmation" label="Repeat new password" error={errors.confirmation?.message}>
        <Input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmation}
          {...register('confirmation')}
        />
      </FormField>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Set new password'}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      description="All your other devices will be logged out"
      footer={
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Back to log in
        </Link>
      }
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  )
}
