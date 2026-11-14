import { AlertTriangle, RefreshCw, SearchX } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { GraphQLRequestError, type GraphQLErrorShape } from "@/lib/graphql"

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error)
  const code =
    error instanceof GraphQLRequestError ? (error.errors[0]?.extensions?.code as string | undefined) : undefined
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <div className="font-medium">Не удалось загрузить данные</div>
      <p className="max-w-lg text-sm text-muted-foreground">{message}</p>
      {code && <code className="rounded bg-muted px-2 py-0.5 text-xs">{code}</code>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Повторить
        </Button>
      )}
    </div>
  )
}

/** Partial federated response: some subgraph failed, the rest of the page still renders. */
export function PartialErrors({ errors }: { errors: GraphQLErrorShape[] }) {
  if (errors.length === 0) return null
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>Часть данных недоступна</AlertTitle>
      <AlertDescription>
        {errors.slice(0, 3).map((e, i) => (
          <div key={i}>
            {e.path?.join(".")}: {e.message}
          </div>
        ))}
      </AlertDescription>
    </Alert>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
      <SearchX className="size-6" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint && <p className="text-xs">{hint}</p>}
    </div>
  )
}

export function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 p-16 text-center">
      <div className="text-5xl font-semibold">404</div>
      <p className="text-muted-foreground">Страница не найдена</p>
      <Button asChild variant="outline">
        <Link to="/">На главную</Link>
      </Button>
    </div>
  )
}
