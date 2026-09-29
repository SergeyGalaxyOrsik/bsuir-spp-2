export const SESSION_EXPIRED_EVENT = 'auth:session-expired'

let accessToken: string | null = null

export const getAccessToken = () => accessToken

export const setAccessToken = (token: string | null) => {
  accessToken = token
}

export const notifySessionExpired = () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
