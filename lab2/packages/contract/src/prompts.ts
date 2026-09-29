import { oc } from '@orpc/contract'
import { z } from 'zod'
import { promptFieldsSchema, promptModelSchema, promptPageSchema, promptSchema } from './schemas'

const list = oc
  .route({ method: 'GET', path: '/prompts', tags: ['prompts'] })
  .input(
    z.object({
      search: z.string().trim().max(100).optional(),
      model: promptModelSchema.optional(),
      mine: z.enum(['true', 'false']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(12),
    }),
  )
  .output(promptPageSchema)

const get = oc
  .route({ method: 'GET', path: '/prompts/{id}', tags: ['prompts'] })
  .input(z.object({ id: z.uuid() }))
  .output(promptSchema)

const create = oc
  .route({ method: 'POST', path: '/prompts', successStatus: 201, tags: ['prompts'] })
  .input(promptFieldsSchema.extend({ file: z.file().optional() }))
  .output(promptSchema)

const update = oc
  .route({ method: 'PUT', path: '/prompts/{id}', tags: ['prompts'] })
  .input(promptFieldsSchema.extend({ id: z.uuid(), file: z.file().optional() }))
  .output(promptSchema)

const remove = oc
  .route({ method: 'DELETE', path: '/prompts/{id}', successStatus: 204, tags: ['prompts'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.void())

const downloadAttachment = oc
  .route({ method: 'GET', path: '/prompts/{id}/attachment', tags: ['prompts'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.file())

const removeAttachment = oc
  .route({ method: 'DELETE', path: '/prompts/{id}/attachment', successStatus: 204, tags: ['prompts'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.void())

export const promptsContract = {
  list,
  get,
  create,
  update,
  remove,
  attachment: { download: downloadAttachment, remove: removeAttachment },
}
