'use client'

import { emailSchema, nameSchema, passwordSchema } from '@lab2/contract'
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

const schema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema })

type Values = z.infer<typeof schema>

export default function RegisterPage() {
  const { register: signUp } = useAuth()
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signUp(values)
      router.replace('/')
    } catch (error) {
      applyServerError(error, setError, { conflictField: 'email' })
    }
  })

  return (
    <AuthCard
      title="Create your account"
      description="Start sharing prompts with everyone"
      footer={
        <span>
          Already registered?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Log in
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <RootError message={errors.root?.server?.message} />
        <FormField id="name" label="Name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
        </FormField>
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </FormField>
        <FormField id="password" label="Password (8 to 72 characters)" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Sign up'}
        </Button>
      </form>
    </AuthCard>
  )
}
