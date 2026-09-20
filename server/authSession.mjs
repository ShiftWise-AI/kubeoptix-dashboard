import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'kubeoptix_session'

const sessions = new Map()
const sessionTtlMs = 8 * 60 * 60 * 1000
const sessionSecret = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex')

function sign(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('base64url')
}

function parseCookies(header) {
  return Object.fromEntries((header ?? '').split(';').flatMap((part) => {
    const separator = part.indexOf('=')
    if (separator < 0) return []
    return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]]
  }))
}

function cookieValueIsValid(value) {
  const separator = value.lastIndexOf('.')
  if (separator <= 0) return false
  const expected = sign(value.slice(0, separator))
  const actual = value.slice(separator + 1)
  return actual.length === expected.length
    && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

export function identityFromRequest(request) {
  const username = request.headers['x-forwarded-user']
  if (typeof username !== 'string' || username.trim() === '') return null
  const displayName = request.headers['x-forwarded-preferred-username']
    ?? request.headers['x-forwarded-email']
  return {
    username: username.trim(),
    ...(typeof displayName === 'string' && displayName.trim() ? { displayName: displayName.trim() } : {}),
  }
}

export function getSession(request) {
  const identity = identityFromRequest(request)
  const cookie = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME]
  if (!identity || !cookie || !cookieValueIsValid(cookie)) return null
  const session = sessions.get(cookie.split('.')[0])
  if (!session || session.expiresAt <= Date.now() || session.username !== identity.username) {
    sessions.delete(cookie.split('.')[0])
    return null
  }
  return { identity, cookie }
}

export function establishSession(request, response) {
  const identity = identityFromRequest(request)
  if (!identity) return null
  const existing = getSession(request)
  if (existing) {
    existing.identity = identity
    return existing
  }

  const id = randomBytes(32).toString('base64url')
  const value = `${id}.${sign(id)}`
  sessions.set(id, { username: identity.username, expiresAt: Date.now() + sessionTtlMs })
  const secure = process.env.SESSION_COOKIE_SECURE !== 'false'
  response.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${sessionTtlMs / 1000}`)
  return { identity, cookie: value }
}

export function clearSession(request, response) {
  const cookie = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME]
  if (cookie) sessions.delete(cookie.split('.')[0])
  response.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`)
}

export function clearSessionsForTests() {
  sessions.clear()
}
