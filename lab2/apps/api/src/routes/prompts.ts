import { forbidden, notFound } from '../errors'
import { authed } from '../middleware/auth'
import { canModifyPrompt } from '../prompts/permissions'
import { acceptAttachment } from '../prompts/attachment-policy'
import type { Services } from '../context'
import { toPromptDto } from '../serializers'

type Actor = { id: string; role: 'user' | 'moderator' | 'admin' }

async function requirePrompt(services: Services, id: string) {
  const prompt = await services.prompts.findById(id)
  if (!prompt) throw notFound('Prompt not found')
  return prompt
}

async function loadModifiablePrompt(services: Services, id: string, actor: Actor) {
  const prompt = await requirePrompt(services, id)
  if (!canModifyPrompt(actor, prompt)) throw forbidden('You can only modify your own prompts')
  return prompt
}

async function withRollbackOfStoredFile<Result>(
  services: Services,
  attachmentPath: string | undefined,
  operation: () => Promise<Result>,
) {
  try {
    return await operation()
  } catch (error) {
    if (attachmentPath) await services.storage.remove(attachmentPath)
    throw error
  }
}

const list = authed.prompts.list.handler(async ({ input, context }) => {
  const { items, total } = await context.services.prompts.list({
    page: input.page,
    limit: input.limit,
    search: input.search,
    model: input.model,
    authorId: input.mine === 'true' ? context.auth.user.id : undefined,
  })
  return { items: items.map(toPromptDto), total, page: input.page, limit: input.limit }
})

const get = authed.prompts.get.handler(async ({ input, context }) =>
  toPromptDto(await requirePrompt(context.services, input.id)),
)

const create = authed.prompts.create.handler(async ({ input, context }) => {
  const { services, auth } = context
  const { file, ...fields } = input
  const attachment = file ? await acceptAttachment(file, services.storage) : undefined
  return withRollbackOfStoredFile(services, attachment?.path, async () => {
    const created = await services.prompts.create({ ...fields, authorId: auth.user.id })
    if (attachment) await services.prompts.setAttachment(created.id, attachment)
    return toPromptDto(await requirePrompt(services, created.id))
  })
})

const update = authed.prompts.update.handler(async ({ input, context }) => {
  const { services, auth } = context
  const { id, file, ...fields } = input
  const existing = await loadModifiablePrompt(services, id, auth.user)
  const attachment = file ? await acceptAttachment(file, services.storage) : undefined
  return withRollbackOfStoredFile(services, attachment?.path, async () => {
    const updated = await services.prompts.update(id, fields)
    if (!updated) throw notFound('Prompt not found')
    if (attachment) {
      await services.prompts.setAttachment(id, attachment)
      if (existing.attachment) await services.storage.remove(existing.attachment.path)
    }
    return toPromptDto(await requirePrompt(services, id))
  })
})

const remove = authed.prompts.remove.handler(async ({ input, context }) => {
  const { services, auth } = context
  await loadModifiablePrompt(services, input.id, auth.user)
  const removed = await services.prompts.remove(input.id)
  if (removed?.attachment) await services.storage.remove(removed.attachment.path)
})

const downloadAttachment = authed.prompts.attachment.download.handler(async ({ input, context }) => {
  const prompt = await requirePrompt(context.services, input.id)
  if (!prompt.attachment) throw notFound('This prompt has no attachment')
  const content = await context.services.storage.read(prompt.attachment.path)
  return new File([new Uint8Array(content)], prompt.attachment.name, { type: prompt.attachment.mime })
})

const removeAttachment = authed.prompts.attachment.remove.handler(async ({ input, context }) => {
  const { services, auth } = context
  const prompt = await loadModifiablePrompt(services, input.id, auth.user)
  if (!prompt.attachment) throw notFound('This prompt has no attachment')
  await services.prompts.setAttachment(prompt.id, null)
  await services.storage.remove(prompt.attachment.path)
})

export const promptRoutes = {
  list,
  get,
  create,
  update,
  remove,
  attachment: { download: downloadAttachment, remove: removeAttachment },
}
