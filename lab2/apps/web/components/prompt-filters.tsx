'use client'

import { promptModelSchema, type PromptModel } from '@lab2/contract'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type PromptFiltersBarProps = {
  search: string
  model: PromptModel | 'all'
  mine: boolean
  onSearchChange: (value: string) => void
  onModelChange: (value: PromptModel | 'all') => void
  onMineChange: (value: boolean) => void
}

const MODEL_ITEMS = [
  { value: 'all', label: 'All models' },
  ...promptModelSchema.options.map((option) => ({ value: option, label: option.toUpperCase() })),
]

export function PromptFiltersBar({ search, model, mine, onSearchChange, onModelChange, onMineChange }: PromptFiltersBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        className="sm:max-w-xs"
        placeholder="Search prompts"
        aria-label="Search prompts"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <Select
        items={MODEL_ITEMS}
        value={model}
        onValueChange={(value) => value && onModelChange(value as PromptModel | 'all')}
      >
        <SelectTrigger className="sm:w-40" aria-label="Filter by model">
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
      <ToggleGroup
        variant="outline"
        value={[mine ? 'mine' : 'all']}
        onValueChange={(value) => value[0] && onMineChange(value[0] === 'mine')}
      >
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="mine">Mine</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
