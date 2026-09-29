export function parseTags(text: string) {
  const tags = text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  return [...new Set(tags)]
}
