import { attachmentRules, resolveAttachmentMime } from '@lab2/contract'
import { payloadTooLarge, unsupportedMediaType } from '../errors'
import type { FileStorage, StoredFile } from '../storage/file-storage'

export async function acceptAttachment(file: File, storage: FileStorage): Promise<StoredFile> {
  const mime = resolveAttachmentMime(file)
  if (!(attachmentRules.allowedMimeTypes as readonly string[]).includes(mime)) {
    throw unsupportedMediaType('Unsupported file type. Allowed: PNG, JPEG, WebP, TXT, Markdown, PDF')
  }
  if (file.size > attachmentRules.maxBytes) {
    throw payloadTooLarge('File is too large. Maximum size is 5 MB')
  }
  const stored = await storage.save(file)
  return { ...stored, mime }
}
