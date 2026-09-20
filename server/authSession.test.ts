import { afterEach, describe, expect, it } from 'vitest'
import {
  clearSession,
  clearSessionsForTests,
  establishSession,
  getSession,
  identityFromRequest,
} from './authSession.mjs'

function request(headers: Record<string, string> = {}) {
  return { headers }
}

function response() {
  const headers = new Map<string, string>()
  return {
    setHeader(name: string, value: string) {
      headers.set(name, value)
    },
    headers,
  }
}

afterEach(() => clearSessionsForTests())

describe('OpenShift-bound application sessions', () => {
  it('uses only the identity headers supplied by the OAuth proxy', () => {
    expect(identityFromRequest(request({
      'x-forwarded-user': 'alice',
      'x-forwarded-preferred-username': 'Alice Example',
    }))).toEqual({ username: 'alice', displayName: 'Alice Example' })
    expect(identityFromRequest(request())).toBeNull()
  })

  it('creates an opaque session and validates the same OpenShift identity', () => {
    const firstResponse = response()
    const session = establishSession(request({ 'x-forwarded-user': 'alice' }), firstResponse)
    expect(session?.identity.username).toBe('alice')
    expect(firstResponse.headers.get('Set-Cookie')).toContain('HttpOnly')

    const cookie = firstResponse.headers.get('Set-Cookie')?.match(/kubeoptix_session=([^;]+)/)?.[1]
    expect(cookie).toBeTruthy()
    expect(getSession(request({
      'x-forwarded-user': 'alice',
      cookie: `kubeoptix_session=${cookie}`,
    }))).not.toBeNull()
    expect(getSession(request({
      'x-forwarded-user': 'bob',
      cookie: `kubeoptix_session=${cookie}`,
    }))).toBeNull()
  })

  it('clears the local session without exposing its value', () => {
    const firstResponse = response()
    establishSession(request({ 'x-forwarded-user': 'alice' }), firstResponse)
    const cookie = firstResponse.headers.get('Set-Cookie')?.match(/kubeoptix_session=([^;]+)/)?.[1]
    const logoutResponse = response()
    clearSession(request({ cookie: `kubeoptix_session=${cookie}` }), logoutResponse)
    expect(logoutResponse.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(getSession(request({
      'x-forwarded-user': 'alice',
      cookie: `kubeoptix_session=${cookie}`,
    }))).toBeNull()
  })
})
