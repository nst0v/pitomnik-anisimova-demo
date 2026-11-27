import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)
const DEFAULT_PASSWORD_HASH = 'scrypt$5737ce30277176a755dcc50b2b2eb6d5$1e5f3f10cd36ea1389e25f466aef815c37d5d04cb4ef521de01fa76bc8dba9944f1c49264dfa5f9cc1acc0c2dccdc0847c8d585c8a335ff626b28de16cdffbd0'
const COOKIE_NAME = 'nursery_admin'
const MAX_BODY_BYTES = 4096

export function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  response.end(JSON.stringify(body))
}

export function isSameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === request.headers.host && parsed.origin === origin
  } catch {
    return false
  }
}

export function readJson(request, maximumBytes = MAX_BODY_BYTES) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    request.resume()
    return Promise.reject(Object.assign(new Error('Используйте формат JSON.'), { status: 415 }))
  }
  if (Number(request.headers['content-length']) > maximumBytes) {
    request.resume()
    return Promise.reject(Object.assign(new Error('Слишком большой запрос.'), { status: 413 }))
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    let settled = false
    request.on('data', (chunk) => {
      if (settled) return
      bytes += chunk.length
      if (bytes > maximumBytes) {
        settled = true
        chunks.length = 0
        reject(Object.assign(new Error('Слишком большой запрос.'), { status: 413 }))
      } else chunks.push(chunk)
    })
    request.on('end', () => {
      if (settled) return
      settled = true
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
        resolve(value)
      } catch {
        reject(Object.assign(new Error('Не удалось прочитать данные запроса.'), { status: 400 }))
      }
    })
    const abort = () => {
      if (!settled) {
        settled = true
        reject(Object.assign(new Error('Запрос прерван.'), { status: 400 }))
      }
    }
    request.once('aborted', abort)
    request.once('error', abort)
  })
}

function equalTokens(left, right) {
  return typeof left === 'string' && typeof right === 'string' && /^[a-f0-9]{64}$/.test(left) && /^[a-f0-9]{64}$/.test(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

export function validCsrf(request, session) {
  return Boolean(session && equalTokens(request.headers['x-csrf-token'], session.csrfToken))
}

export function createAdminHandler(options = {}) {
  const passwordHash = options.passwordHash ?? process.env.ADMIN_PASSWORD_HASH ?? DEFAULT_PASSWORD_HASH
  const parts = passwordHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) {
    throw new Error('ADMIN_PASSWORD_HASH must use scrypt$<32 hexadecimal salt>$<128 hexadecimal key>.')
  }
  const expectedKey = Buffer.from(parts[2], 'hex')
  const now = options.now ?? Date.now
  const sessionTtlMs = Math.min(options.sessionTtlMs ?? 8 * 60 * 60 * 1000, 8 * 60 * 60 * 1000)
  const rateLimitWindowMs = options.rateLimitWindowMs ?? 15 * 60 * 1000
  const maxLoginAttempts = options.maxLoginAttempts ?? 10
  const sessions = new Map()
  const attempts = new Map()

  const cookieId = (request) => {
    const value = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1)
    return /^[a-f0-9]{64}$/.test(value ?? '') ? value : null
  }

  const getSession = (request) => {
    const id = cookieId(request)
    const session = id ? sessions.get(id) : null
    if (session && session.expiresAt > now()) return session
    if (id) sessions.delete(id)
    return null
  }

  const cookie = (request, id, expiresAt) => {
    const secure = options.secureCookies ?? request.socket.encrypted === true
    return `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${id ? Math.ceil(sessionTtlMs / 1000) : 0}; Expires=${new Date(expiresAt).toUTCString()}${secure ? '; Secure' : ''}`
  }

  const prune = () => {
    const time = now()
    for (const [id, session] of sessions) if (session.expiresAt <= time) sessions.delete(id)
    for (const [ip, entry] of attempts) if (entry.resetAt <= time) attempts.delete(ip)
    // Both maps are bounded even when many different clients contact the server.
    while (sessions.size >= 10_000) sessions.delete(sessions.keys().next().value)
    while (attempts.size >= 10_000) attempts.delete(attempts.keys().next().value)
  }

  const handler = async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (!['/api/admin/session', '/api/admin/login', '/api/admin/logout'].includes(path)) return false
    const expectedMethod = path.endsWith('/session') ? 'GET' : 'POST'
    if (request.method !== expectedMethod) {
      request.resume()
      sendJson(response, 405, { error: 'Этот способ запроса не поддерживается.' }, { Allow: expectedMethod })
      return true
    }
    if (request.method === 'POST' && !isSameOrigin(request)) {
      request.resume()
      sendJson(response, 403, { error: 'Запрос с другого сайта запрещён.' })
      return true
    }
    prune()
    if (path.endsWith('/session')) {
      const session = getSession(request)
      sendJson(response, 200, session ? { authenticated: true, csrfToken: session.csrfToken } : { authenticated: false })
      return true
    }
    if (path.endsWith('/logout')) {
      const session = getSession(request)
      if (!validCsrf(request, session)) {
        request.resume()
        sendJson(response, session ? 403 : 401, { error: session ? 'Обновите страницу и повторите действие.' : 'Войдите в кабинет заново.' })
        return true
      }
      sessions.delete(cookieId(request))
      request.resume()
      sendJson(response, 200, { authenticated: false }, { 'Set-Cookie': cookie(request, '', 0) })
      return true
    }

    const ip = request.socket.remoteAddress ?? 'unknown'
    const entry = attempts.get(ip) ?? { count: 0, resetAt: now() + rateLimitWindowMs }
    if (entry.count >= maxLoginAttempts) {
      request.resume()
      sendJson(response, 429, { error: 'Слишком много попыток входа. Попробуйте позже.' }, { 'Retry-After': String(Math.max(1, Math.ceil((entry.resetAt - now()) / 1000))) })
      return true
    }
    entry.count += 1
    attempts.set(ip, entry)
    try {
      const body = await readJson(request)
      if (typeof body.password !== 'string' || body.password.length > 256) {
        sendJson(response, 400, { error: 'Введите пароль.' })
        return true
      }
      const actualKey = await deriveKey(body.password, parts[1], expectedKey.length)
      if (!timingSafeEqual(expectedKey, actualKey)) {
        sendJson(response, 401, { error: 'Неверный пароль. Попробуйте ещё раз.' })
        return true
      }
      const previousId = cookieId(request)
      if (previousId) sessions.delete(previousId)
      const id = randomBytes(32).toString('hex')
      const session = { csrfToken: randomBytes(32).toString('hex'), expiresAt: now() + sessionTtlMs }
      sessions.set(id, session)
      attempts.delete(ip)
      sendJson(response, 200, { authenticated: true, csrfToken: session.csrfToken }, { 'Set-Cookie': cookie(request, id, session.expiresAt) })
    } catch (error) {
      sendJson(response, error.status ?? 500, { error: error.status ? error.message : 'Не удалось войти. Попробуйте ещё раз.' })
    }
    return true
  }
  handler.getSession = getSession
  return handler
}
