import { AlertCircle, FileText } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function PromptGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-56 w-full" />
      ))}
    </div>
  )
}

export function PromptGridError({ title = 'Could not load data', message, onRetry }: { title?: string; message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="grid gap-3">
        <span>{message}</span>
        <Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  )
}

export function PromptGridEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <FileText className="size-8 text-muted-foreground" />
      <p className="font-medium">{filtered ? 'No prompts match your filters' : 'No prompts yet'}</p>
      <p className="text-sm text-muted-foreground">
        {filtered ? 'Try a different search or model.' : 'Create the first one with the button above.'}
      </p>
    </div>
  )
}
