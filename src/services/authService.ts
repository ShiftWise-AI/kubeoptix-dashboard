import { AUTH_LOGOUT_REQUEST_TIMEOUT_MS } from '../config/api'
import { executeRequest } from './httpClient'

export type AuthSession = {
  authenticated: boolean
  username?: string
  displayName?: string
}

export async function fetchAuthSession(): Promise<AuthSession> {
  const result = await executeRequest('GET', '/api/auth/session')
  if (typeof result.payload !== 'object' || result.payload === null) {
    throw new Error('The authentication service returned an invalid session.')
  }
  return result.payload as AuthSession
}

export async function logout(): Promise<void> {
  // Bounded timeout so a stalled request never leaves the UI stuck on the logout action.
  await executeRequest('POST', '/api/auth/logout', undefined, { timeoutMs: AUTH_LOGOUT_REQUEST_TIMEOUT_MS })
}
