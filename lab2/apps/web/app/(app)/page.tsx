'use client'

import type { PromptDto } from '@lab2/contract'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useCurrentUser } from '@/components/auth-provider'
import { DeletePromptDialog } from '@/components/delete-prompt-dialog'
import { PromptCard } from '@/components/prompt-card'
import { PromptFiltersBar } from '@/components/prompt-filters'
import { PromptFormDialog } from '@/components/prompt-form-dialog'
import { PromptGridEmpty, PromptGridError, PromptGridSkeleton } from '@/components/prompt-grid-states'
import { Button } from '@/components/ui/button'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { PAGE_SIZE, usePrompts, type PromptFilters } from '@/hooks/use-prompts'
import { describeError } from '@/lib/errors'
import { clampPage } from '@/lib/pagination'

const SEARCH_DEBOUNCE_MS = 300

export default function LibraryPage() {
  const user = useCurrentUser()
  const [search, setSearch] = useState('')
  const [model, setModel] = useState<PromptFilters['model']>('all')
  const [mine, setMine] = useState(false)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PromptDto | undefined>()
  const [deleting, setDeleting] = useState<PromptDto | null>(null)

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const prompts = usePrompts({ search: debouncedSearch, model, mine, page })

  if (prompts.data) {
    const clampedPage = clampPage(page, prompts.data.total, PAGE_SIZE)
    if (clampedPage !== page) setPage(clampedPage)
  }

  const resetPageAnd = <Value,>(setter: (value: Value) => void) => (value: Value) => {
    setter(value)
    setPage(1)
  }

  const openCreate = () => {
    setEditing(undefined)
    setFormOpen(true)
  }

  const openEdit = (prompt: PromptDto) => {
    setEditing(prompt)
    setFormOpen(true)
  }

  const totalPages = Math.max(1, Math.ceil((prompts.data?.total ?? 0) / PAGE_SIZE))
  const filtered = debouncedSearch !== '' || model !== 'all' || mine

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prompts</h1>
          <p className="text-sm text-muted-foreground">Browse everything the community has shared.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          New prompt
        </Button>
      </div>

      <PromptFiltersBar
        search={search}
        model={model}
        mine={mine}
        onSearchChange={resetPageAnd(setSearch)}
        onModelChange={resetPageAnd(setModel)}
        onMineChange={resetPageAnd(setMine)}
      />

      {prompts.isPending && <PromptGridSkeleton />}
      {prompts.isError && (
        <PromptGridError title="Could not load prompts" message={describeError(prompts.error).message} onRetry={() => prompts.refetch()} />
      )}
      {prompts.data && prompts.data.items.length === 0 && <PromptGridEmpty filtered={filtered} />}
      {prompts.data && prompts.data.items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {prompts.data.items.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} user={user} onEdit={openEdit} onDelete={setDeleting} />
          ))}
        </div>
      )}

      {prompts.data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      <PromptFormDialog open={formOpen} prompt={editing} onOpenChange={setFormOpen} />
      <DeletePromptDialog prompt={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}
