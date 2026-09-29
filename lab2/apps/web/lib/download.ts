import type { PromptDto } from '@lab2/contract'
import { client } from './api'

export async function downloadAttachment(prompt: PromptDto) {
  const file = await client.prompts.attachment.download({ id: prompt.id })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = prompt.attachment?.name ?? file.name
  link.click()
  URL.revokeObjectURL(url)
}
