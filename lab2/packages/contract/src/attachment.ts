export const attachmentRules = {
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/markdown',
    'application/pdf',
  ],
} as const

const MIME_BY_EXTENSION: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
}

export function resolveAttachmentMime(file: { name: string; type: string }) {
  const declared = (file.type.split(';')[0] ?? '').trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') return declared
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension] ?? declared
}

export function validateAttachment(file: { name: string; size: number; type: string }): string | null {
  if (!(attachmentRules.allowedMimeTypes as readonly string[]).includes(resolveAttachmentMime(file))) {
    return 'Unsupported file type. Allowed: PNG, JPEG, WebP, TXT, Markdown, PDF'
  }
  if (file.size > attachmentRules.maxBytes) {
    return 'File is too large. Maximum size is 5 MB'
  }
  return null
}
