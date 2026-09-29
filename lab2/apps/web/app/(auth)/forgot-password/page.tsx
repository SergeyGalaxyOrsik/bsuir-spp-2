'use client'

import { emailSchema } from '@lab2/contract'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AuthCard } from '@/components/auth-card'
import { FormField } from '@/components/form-field'
import { RootError } from '@/components/root-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { client } from '@/lib/api'
import { applyServerError } from '@/lib/form-errors'

const schema = z.object({ email: emailSchema })

type Values = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await client.auth.password.forgot(values)
      setConfirmation(result.message)
    } catch (error) {
      applyServerError(error, setError)
    }
  })

  return (
    <AuthCard
      title="Reset your password"
      description="We will email you a link that is valid for 30 minutes"
      footer={
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <RootError message={errors.root?.server?.message} />
        {confirmation && (
          <Alert>
            <CheckCircle2 />
            <AlertDescription>{confirmation}</AlertDescription>
          </Alert>
        )}
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  )
}
