export function clampPage(page: number, total: number, pageSize: number) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  return Math.min(page, lastPage)
}
