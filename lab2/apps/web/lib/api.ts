import { contract } from '@lab2/contract'
import { ORPCError, createORPCClient } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { getAccessToken, notifySessionExpired, setAccessToken } from './auth-token'

type ApiClient = JsonifiedClient<ContractRouterClient<typeof contract>>
type AuthResult = Awaited<ReturnType<ApiClient['auth']['refresh']>>

const PATHS_WITHOUT_REFRESH = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/password/']
const REFRESH_ATTEMPTS = 2

let pendingRefresh: Promise<AuthResult | null> | null = null

async function requestNewSession(): Promise<AuthResult | null> {
  for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
    try {
      const result = await client.auth.refresh()
      setAccessToken(result.accessToken)
      return result
    } catch (error) {
      const rejected = error instanceof ORPCError && error.status === 401
      if (!rejected) return null
    }
  }
  setAccessToken(null)
  notifySessionExpired()
  return null
}

export function refreshSession() {
  pendingRefresh ??= requestNewSession().finally(() => {
    pendingRefresh = null
  })
  return pendingRefresh
}

async function fetchWithRefresh(request: Request, init: RequestInit) {
  const retryRequest = request.clone()
  const response = await fetch(request, { ...init, credentials: 'include' })
  const path = new URL(request.url).pathname
  const canRefresh = response.status === 401 && !PATHS_WITHOUT_REFRESH.some((prefix) => path.startsWith(prefix))
  if (!canRefresh || !(await refreshSession())) return response

  retryRequest.headers.set('authorization', `Bearer ${getAccessToken()}`)
  return fetch(retryRequest, { ...init, credentials: 'include' })
}

const link = new OpenAPILink(contract, {
  url: () => `${window.location.origin}/api`,
  headers: () => {
    const token = getAccessToken()
    return token ? { authorization: `Bearer ${token}` } : {}
  },
  fetch: fetchWithRefresh,
})

export const client: ApiClient = createORPCClient(link)
