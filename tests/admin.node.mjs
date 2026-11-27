import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { scryptSync } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createAdminHandler } from '../server/auth.mjs'

const TEST_PASSWORD = 'a-test-password'
const salt = '0123456789abcdef0123456789abcdef'
const passwordHash = `scrypt$${salt}$${scryptSync(TEST_PASSWORD, salt, 64).toString('hex')}`

async function withServer(t, options = {}) {
  const handler = createAdminHandler({ passwordHash, ...options })
  const server = createServer(async (request, response) => {
    if (!await handler(request, response)) { response.writeHead(404); response.end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
  const origin = `http://127.0.0.1:${server.address().port}`
  const request = (path, options = {}) => fetch(`${origin}${path}`, options)
  const login = (password = TEST_PASSWORD, headers = {}) => request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify({ password }) })
  return { request, login, origin, handler }
}

test('admin login checks password server-side, issues HttpOnly session, and revokes it on logout', async (t) => {
  const { request, login, origin } = await withServer(t)
  const anonymous = await request('/api/admin/session')
  assert.equal(anonymous.status, 200)
  assert.equal(anonymous.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await anonymous.json(), { authenticated: false })
  const wrong = await login('wrong-password')
  assert.equal(wrong.status, 401)
  assert.equal(wrong.headers.get('set-cookie'), null)
  const success = await login()
  assert.equal(success.status, 200)
  const setCookie = success.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Strict/)
  assert.match(setCookie, /Path=\//)
  assert.match(setCookie, /Max-Age=28800/)
  const cookie = setCookie.split(';')[0]
  const session = await success.json()
  assert.equal(session.authenticated, true)
  assert.match(session.csrfToken, /^[a-f0-9]{64}$/)
  const authenticated = await request('/api/admin/session', { headers: { Cookie: cookie } })
  assert.deepEqual(await authenticated.json(), session)
  const badLogout = await request('/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin } })
  assert.equal(badLogout.status, 403)
  const crossSiteLogout = await request('/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://attacker.example', 'X-CSRF-Token': session.csrfToken } })
  assert.equal(crossSiteLogout.status, 403)
  const logout = await request('/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': session.csrfToken } })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.deepEqual(await logout.json(), { authenticated: false })
  const revoked = await request('/api/admin/session', { headers: { Cookie: cookie } })
  assert.deepEqual(await revoked.json(), { authenticated: false })
})

test('expired and forged session cookies cannot authenticate', async (t) => {
  let time = Date.now()
  const { request, login } = await withServer(t, { sessionTtlMs: 1000, now: () => time, secureCookies: true })
  const response = await login()
  assert.match(response.headers.get('set-cookie'), /; Secure/)
  const cookie = response.headers.get('set-cookie').split(';')[0]
  time += 1001
  const expired = await request('/api/admin/session', { headers: { Cookie: cookie } })
  assert.deepEqual(await expired.json(), { authenticated: false })
  const forged = await request('/api/admin/session', { headers: { Cookie: `nursery_admin=${'a'.repeat(64)}` } })
  assert.deepEqual(await forged.json(), { authenticated: false })
})

test('successful repeat login rotates session and CSRF token', async (t) => {
  const { request, login, origin } = await withServer(t)
  const first = await login()
  const firstSession = await first.json()
  const firstCookie = first.headers.get('set-cookie').split(';')[0]
  const second = await login(TEST_PASSWORD, { Cookie: firstCookie })
  const secondSession = await second.json()
  assert.notEqual(second.headers.get('set-cookie').split(';')[0], firstCookie)
  assert.notEqual(secondSession.csrfToken, firstSession.csrfToken)
  assert.deepEqual(await (await request('/api/admin/session', { headers: { Cookie: firstCookie } })).json(), { authenticated: false })
  const staleCsrf = await request('/api/admin/logout', { method: 'POST', headers: { Origin: origin, Cookie: second.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': firstSession.csrfToken } })
  assert.equal(staleCsrf.status, 403)
})

test('login rate limit rejects repeated guesses and expires after the configured window', async (t) => {
  let time = Date.now()
  const { login } = await withServer(t, { maxLoginAttempts: 2, rateLimitWindowMs: 1000, now: () => time })
  assert.equal((await login('wrong')).status, 401)
  assert.equal((await login('wrong')).status, 401)
  const limited = await login()
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '1')
  time += 1001
  assert.equal((await login()).status, 200)
})

test('login rejects cross-origin, invalid methods, malformed JSON, and oversized bodies', async (t) => {
  const { request, login } = await withServer(t, { maxLoginAttempts: 20 })
  assert.equal((await login(TEST_PASSWORD, { Origin: 'https://attacker.example' })).status, 403)
  assert.equal((await login(TEST_PASSWORD, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await request('/api/admin/login')).status, 405)
  assert.equal((await request('/api/admin/session', { method: 'POST' })).status, 405)
  assert.equal((await request('/api/admin/login', { method: 'POST', body: 'not-json' })).status, 415)
  assert.equal((await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400)
  assert.equal((await login('a'.repeat(5000))).status, 413)
  assert.equal((await login('a'.repeat(257))).status, 400)
  assert.equal((await request('/api/admin/products')).status, 404, 'auth lets content routes fall through')
})

test('invalid configured password hash fails at server startup', () => {
  assert.throws(() => createAdminHandler({ passwordHash: 'plaintext' }), /ADMIN_PASSWORD_HASH/)
})

test('production server serves direct admin URLs and assets while keeping files outside dist private', async (t) => {
  const { createSiteServer } = await import('../server/index.mjs')
  const temporary = await mkdtemp(join(tmpdir(), 'nursery-admin-static-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const root = join(temporary, 'dist')
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<!doctype html><html><head></head><body>Nursery</body></html>')
  await writeFile(join(root, 'assets', 'app.js'), 'console.log("nursery")')
  await writeFile(join(temporary, 'private.txt'), 'private server data')
  await symlink(join(temporary, 'private.txt'), join(root, 'linked-private.txt'))
  const server = createSiteServer({ root, dataDirectory: join(temporary, 'content'), passwordHash })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const path of ['/', '/admin', '/admin/']) {
    const response = await fetch(`${origin}${path}`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/html/)
    const html = await response.text()
    assert.match(html, /Nursery/)
    if (path.startsWith('/admin')) {
      assert.match(html, /<head><base href="\/">/)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
    }
  }
  const asset = await fetch(`${origin}/assets/app.js`)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type'), /text\/javascript/)
  assert.match(asset.headers.get('cache-control'), /immutable/)
  const head = await fetch(`${origin}/admin`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.ok(Number(head.headers.get('content-length')) > 0)
  assert.equal((await fetch(`${origin}/..%2fprivate.txt`)).status, 403)
  assert.equal((await fetch(`${origin}/linked-private.txt`)).status, 403)
  assert.equal((await fetch(`${origin}/assets/`)).status, 404)
  assert.equal((await fetch(`${origin}/server/auth.mjs`)).status, 404)
  assert.equal((await fetch(`${origin}/admin`, { method: 'POST' })).status, 405)
})

test('production auth and content handlers require the same live session for saving and publishing', async (t) => {
  const { createSiteServer } = await import('../server/index.mjs')
  const temporary = await mkdtemp(join(tmpdir(), 'nursery-admin-integration-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  let time = Date.now()
  const server = createSiteServer({ root: temporary, dataDirectory: join(temporary, 'content'), passwordHash, sessionTtlMs: 1000, now: () => time })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = (action, body, headers = {}) => fetch(`${origin}/api/admin/${action}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  assert.equal((await post('products', { catalogNumber: 1, price: 75 })).status, 401)
  const login = await post('login', { password: TEST_PASSWORD })
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const { csrfToken } = await login.json()
  const headers = { Cookie: cookie, 'X-CSRF-Token': csrfToken }
  assert.equal((await post('products', { catalogNumber: 1, price: 75 }, { Cookie: cookie })).status, 403)
  assert.equal((await post('products', { catalogNumber: 1, price: 75 }, headers)).status, 200)
  const article = { slug: 'integration-article', title: 'Статья из кабинета', blocks: [{ type: 'paragraph', text: 'Проверка публикации статьи после входа администратора.' }] }
  assert.equal((await post('articles', article, headers)).status, 200)
  const published = await (await fetch(`${origin}/api/content/articles/integration-article`)).json()
  assert.equal(published.title, article.title)
  const content = await (await fetch(`${origin}/site-content.json`)).json()
  assert.equal(content.products.find((product) => product.catalogNumber === 1).price, 75)
  assert.equal(content.articles[0].slug, article.slug)
  time += 1001
  assert.equal((await post('products', { catalogNumber: 1, price: 85 }, headers)).status, 401, 'expired auth session must not authorize content writes')
  assert.equal((await (await fetch(`${origin}/site-content.json`)).json()).products[0].price, 75)
})
