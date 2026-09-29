import type { PromptDto, PromptModel } from '@lab2/contract'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client } from '@/lib/api'

export const PAGE_SIZE = 12

export type PromptFilters = { search: string; model: PromptModel | 'all'; mine: boolean; page: number }

type PromptValues = { title: string; body: string; model: PromptModel; tags: string[] }

const promptsKey = ['prompts'] as const

export function usePrompts(filters: PromptFilters) {
  return useQuery({
    queryKey: [...promptsKey, filters],
    queryFn: () =>
      client.prompts.list({
        search: filters.search || undefined,
        model: filters.model === 'all' ? undefined : filters.model,
        mine: filters.mine ? 'true' : undefined,
        page: filters.page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })
}

function useInvalidatePrompts() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: promptsKey })
}

export function useSavePrompt() {
  const invalidate = useInvalidatePrompts()
  return useMutation({
    mutationFn: ({ id, values, file }: { id?: string; values: PromptValues; file?: File }) =>
      id ? client.prompts.update({ id, ...values, file }) : client.prompts.create({ ...values, file }),
    onSuccess: invalidate,
  })
}

export function useDeletePrompt() {
  const invalidate = useInvalidatePrompts()
  return useMutation({
    mutationFn: (prompt: PromptDto) => client.prompts.remove({ id: prompt.id }),
    onSuccess: invalidate,
  })
}

export function useRemoveAttachment() {
  const invalidate = useInvalidatePrompts()
  return useMutation({
    mutationFn: (prompt: PromptDto) => client.prompts.attachment.remove({ id: prompt.id }),
    onSuccess: invalidate,
  })
}
