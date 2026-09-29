'use client'

import type { PromptDto } from '@lab2/contract'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeletePrompt } from '@/hooks/use-prompts'
import { describeError } from '@/lib/errors'

type DeletePromptDialogProps = { prompt: PromptDto | null; onClose: () => void }

export function DeletePromptDialog({ prompt, onClose }: DeletePromptDialogProps) {
  const deletion = useDeletePrompt()

  const confirm = async () => {
    if (!prompt) return
    try {
      await deletion.mutateAsync(prompt)
      toast.success('Prompt deleted')
    } catch (error) {
      toast.error(describeError(error).message)
    } finally {
      onClose()
    }
  }

  return (
    <AlertDialog open={prompt !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{prompt?.title}&rdquo; and its attachment will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={deletion.isPending}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
