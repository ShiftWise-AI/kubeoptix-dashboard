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
  await executeRequest('POST', '/api/auth/logout')
}
