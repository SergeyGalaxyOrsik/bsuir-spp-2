'use client'

import { promptFieldsSchema, promptModelSchema, validateAttachment, type PromptDto, type PromptModel } from '@lab2/contract'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/form-field'
import { RootError } from '@/components/root-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useRemoveAttachment, useSavePrompt } from '@/hooks/use-prompts'
import { describeError } from '@/lib/errors'
import { applyServerError } from '@/lib/form-errors'
import { parseTags } from '@/lib/tags'

const MAX_TAGS = 10
const MAX_TAG_LENGTH = 30

const MODEL_ITEMS = promptModelSchema.options.map((option) => ({ value: option, label: option.toUpperCase() }))

const formSchema = z.object({
  title: promptFieldsSchema.shape.title,
  body: promptFieldsSchema.shape.body,
  model: promptFieldsSchema.shape.model,
  tagsText: z
    .string()
    .refine((text) => parseTags(text).length <= MAX_TAGS, `Use at most ${MAX_TAGS} tags`)
    .refine((text) => parseTags(text).every((tag) => tag.length <= MAX_TAG_LENGTH), `Each tag must be at most ${MAX_TAG_LENGTH} characters`),
})

type Values = z.infer<typeof formSchema>

type PromptFormDialogProps = { open: boolean; prompt?: PromptDto; onOpenChange: (open: boolean) => void }
type PromptFormProps = { prompt?: PromptDto; onClose: () => void }

function defaultValuesFor(prompt?: PromptDto): Values {
  return {
    title: prompt?.title ?? '',
    body: prompt?.body ?? '',
    model: prompt?.model ?? 'gpt',
    tagsText: prompt?.tags.join(', ') ?? '',
  }
}

function PromptForm({ prompt, onClose }: PromptFormProps) {
  const save = useSavePrompt()
  const removeAttachment = useRemoveAttachment()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [attachmentRemoved, setAttachmentRemoved] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(formSchema), defaultValues: defaultValuesFor(prompt) })

  const chooseFile = (chosen: File | null) => {
    setFile(chosen)
    setFileError(chosen ? validateAttachment(chosen) : null)
  }

  const deleteExistingAttachment = async () => {
    if (!prompt) return
    try {
      await removeAttachment.mutateAsync(prompt)
      setAttachmentRemoved(true)
      toast.success('Attachment removed')
    } catch (error) {
      setError('root.server', { message: describeError(error).message })
    }
  }

  const onSubmit = handleSubmit(async ({ tagsText, ...fields }) => {
    if (fileError) return
    try {
      await save.mutateAsync({
        id: prompt?.id,
        values: { ...fields, tags: parseTags(tagsText) },
        file: file ?? undefined,
      })
      toast.success(prompt ? 'Prompt updated' : 'Prompt created')
      onClose()
    } catch (error) {
      applyServerError(error, setError, { fieldAliases: { tags: 'tagsText' } })
    }
  })

  const existingAttachmentName = prompt?.attachment && !attachmentRemoved ? prompt.attachment.name : null

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <RootError message={errors.root?.server?.message} />
      <FormField id="title" label="Title" error={errors.title?.message}>
        <Input id="title" aria-invalid={!!errors.title} {...register('title')} />
      </FormField>
      <FormField id="body" label="Prompt" error={errors.body?.message}>
        <Textarea id="body" rows={6} aria-invalid={!!errors.body} {...register('body')} />
      </FormField>
      <FormField id="model" label="Model" error={errors.model?.message}>
        <Controller
          control={control}
          name="model"
          render={({ field }) => (
            <Select items={MODEL_ITEMS} value={field.value} onValueChange={(value) => value && field.onChange(value as PromptModel)}>
              <SelectTrigger id="model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <FormField id="tagsText" label="Tags (comma separated)" error={errors.tagsText?.message}>
        <Input id="tagsText" placeholder="writing, seo" aria-invalid={!!errors.tagsText} {...register('tagsText')} />
      </FormField>
      <FormField id="file" label="Attachment (optional, up to 5 MB)" error={fileError ?? undefined}>
        {existingAttachmentName && (
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="truncate">{existingAttachmentName}</span>
            <Button type="button" variant="ghost" size="sm" onClick={deleteExistingAttachment} disabled={removeAttachment.isPending}>
              Remove
            </Button>
          </div>
        )}
        <Input
          id="file"
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.txt,.md,.pdf"
          aria-invalid={!!fileError}
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function PromptFormDialog({ open, prompt, onOpenChange }: PromptFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{prompt ? 'Edit prompt' : 'New prompt'}</DialogTitle>
          <DialogDescription>Everyone can read it, only you can change it.</DialogDescription>
        </DialogHeader>
        <PromptForm prompt={prompt} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
