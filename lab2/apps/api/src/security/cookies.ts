export const REFRESH_COOKIE_NAME = 'refresh_token'
export const REFRESH_COOKIE_PATH = '/api/auth'

export function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {}
  for (const pair of (header ?? '').split(';')) {
    const separatorIndex = pair.indexOf('=')
    if (separatorIndex === -1) continue
    const name = pair.slice(0, separatorIndex).trim()
    const value = pair.slice(separatorIndex + 1).trim()
    if (name) cookies[name] = decodeCookieValue(value)
  }
  return cookies
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function serializeRefreshCookie(token: string, maxAgeSeconds: number, secure: boolean) {
  return [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export function serializeClearedRefreshCookie(secure: boolean) {
  return serializeRefreshCookie('', 0, secure)
}
