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
    const name = part.slice(0, separator).trim()
    const encodedValue = part.slice(separator + 1).trim()
    try {
      return [[name, decodeURIComponent(encodedValue)]]
    } catch {
      return []
    }
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

// additionalCookieNames lets callers also expire cookies this module does not own (e.g. the
// OAuth reverse-proxy sidecar's session cookie), since that response passes back through the
// sidecar to the browser and is the only reliable way to clear it when authenticated requests
// bypass the sidecar's own sign-out handling. Those cookies are set with an explicit Domain
// attribute by the sidecar, so the clearing directive must repeat the same Domain (derived from
// the request's Host header) or the browser treats it as a different cookie and keeps the
// original alive.
export function clearSession(request, response, additionalCookieNames = []) {
  const cookie = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME]
  if (cookie) sessions.delete(cookie.split('.')[0])
  const host = (request.headers.host ?? '').split(':')[0]
  const ownCookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`
  const otherCookies = additionalCookieNames.map(
    (name) => `${name}=; Path=/; ${host ? `Domain=${host}; ` : ''}HttpOnly; Secure; Max-Age=0; SameSite=Lax`,
  )
  const cookieHeaders = [ownCookie, ...otherCookies]
  response.setHeader('Set-Cookie', cookieHeaders.length > 1 ? cookieHeaders : cookieHeaders[0])
}

export function clearSessionsForTests() {
  sessions.clear()
}
