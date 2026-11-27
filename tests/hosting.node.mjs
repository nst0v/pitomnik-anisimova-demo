import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, symlink, writeFile, readFile, readdir, stat, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

const password = 'isolated-hosting-test-password'
const repository = fileURLToPath(new URL('..', import.meta.url))
const php = process.env.NURSERY_TEST_PHP ?? 'php'

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nursery-hosting-tests-'))
  const shared = join(directory, 'shared')
  let child, logs = ''
  const stop = async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    const timeout = setTimeout(() => child.kill('SIGKILL'), 2000)
    child.kill('SIGTERM')
    try { await exited } finally { clearTimeout(timeout) }
  }
  t.after(async () => { try { await stop() } finally { await rm(directory, { recursive: true, force: true }) } })
  await mkdir(shared, { mode: 0o700 })
  await symlink(repository, join(directory, 'current'))
  const hash = execFileSync(php, ['-r', 'echo password_hash($argv[1], PASSWORD_BCRYPT);', password], { encoding: 'utf8' })
  const config = { password_hash: hash, secure_cookies: false }
  const configure = () => writeFile(join(shared, 'php-config.json'), JSON.stringify(config), { mode: 0o600 })
  await configure()
  const socket = createServer()
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const origin = `http://127.0.0.1:${port}`
  const request = async (path, { body, method = body === undefined ? 'GET' : 'POST', cookie, csrf, headers = {} } = {}) => {
    const response = await fetch(origin + path, {
      method, signal: AbortSignal.timeout(5000),
      headers: { Origin: origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, headers: response.headers, json: text === '' ? null : JSON.parse(text),
      cookie: response.headers.getSetCookie().find((value) => value.startsWith('nursery_admin='))?.split(';')[0] }
  }
  const start = async () => {
    const env = { ...process.env, NURSERY_APP_ROOT: directory }
    delete env.PHP_CLI_SERVER_WORKERS
    child = spawn(php, ['-d', 'session.serialize_handler=php', '-S', `127.0.0.1:${port}`,
      join(repository, 'scripts/hosting/hosting-bridge.php')], { env, stdio: ['ignore', 'ignore', 'pipe'] })
    let failure
    child.on('error', (error) => { failure = error })
    child.stderr.on('data', (bytes) => { logs = (logs + bytes.toString()).slice(-16000) })
    for (let attempt = 0; attempt < 100; attempt++) {
      if (failure || child.exitCode !== null) throw failure ?? new Error(`PHP exited: ${logs}`)
      try { if ((await request('/api/admin/session')).status === 200) return } catch { /* Wait for the socket. */ }
      await delay(25)
    }
    throw new Error(`PHP did not become ready: ${logs}`)
  }
  await start()
  const login = async (cookie) => {
    const result = await request('/api/admin/login', { body: { password }, cookie })
    assert.equal(result.status, 200, JSON.stringify(result.json))
    return { ...result, csrf: result.json.csrfToken }
  }
  return { shared, request, login, config, configure, restart: async () => { await stop(); await start() } }
}

test('native PHP hosting API', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  const content = async () => (await f.request('/site-content.json')).json
  const product = { catalogNumber: 9000, name: 'Проверочное растение', description: 'Описание растения.', category: 'perennials', unit: 'Пакет семян', price: 77 }
  const article = { slug: 'hosting-test', title: 'Проверочная статья', blocks: [{ type: 'paragraph', text: '<script>обычный текст</script>' }] }

  await t.test('anonymous reads allocate no session; login survives restart, rotates and revokes sessions', async () => {
    const anonymous = await f.request('/api/admin/session')
    assert.deepEqual(anonymous.json, { authenticated: false })
    assert.equal(anonymous.cookie, undefined)
    assert.equal((await f.request('/site-content.json')).cookie, undefined)
    assert.deepEqual(await readdir(join(f.shared, 'sessions')), [])
    assert.deepEqual((await f.request('/api/admin/session', { cookie: `nursery_admin=${'a'.repeat(64)}` })).json, anonymous.json)
    const first = await f.login()
    assert.match(first.cookie, /^nursery_admin=[a-f0-9]{64}$/)
    assert.match(first.csrf, /^[a-f0-9]{64}$/)
    assert.match(first.headers.get('set-cookie'), /HttpOnly.*SameSite=Strict/i)
    assert.match(first.headers.get('set-cookie'), /Max-Age=28800/i)
    await f.restart()
    assert.deepEqual((await f.request('/api/admin/session', first)).json, first.json)
    const second = await f.login(first.cookie)
    assert.notEqual(second.cookie, first.cookie)
    assert.notEqual(second.csrf, first.csrf)
    assert.equal((await f.request('/api/admin/session', first)).json.authenticated, false)
    assert.equal((await f.request('/api/admin/logout', { ...second, body: {} })).status, 200)
    assert.equal((await f.request('/api/admin/session', second)).json.authenticated, false)
    f.config.secure_cookies = true
    await f.configure()
    const secure = await f.login()
    assert.match(secure.headers.get('set-cookie'), /; Secure(?:;|$)/i)
    const file = join(f.shared, 'sessions', `sess_${secure.cookie.split('=')[1]}`)
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    await writeFile(file, (await readFile(file, 'utf8')).replace(/expires_at\|i:\d+;/, 'expires_at|i:1;'))
    assert.equal((await f.request('/api/admin/session', secure)).json.authenticated, false)
    f.config.secure_cookies = false
    await f.configure()
  })

  await t.test('methods, origin, CSRF and bounded JSON reject unauthorized or malformed requests', async () => {
    const auth = await f.login()
    assert.equal((await f.request('/api/admin/login')).status, 405)
    assert.equal((await f.request('/api/admin/session', { body: {} })).status, 405)
    assert.equal((await f.request('/api/admin/login', { body: { password }, headers: { Origin: 'https://attacker.example' } })).status, 403)
    assert.equal((await f.request('/api/admin/login', { body: { password }, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403)
    for (const [body, headers, status] of [['x', { 'Content-Type': 'text/plain' }, 415], ['{', {}, 400], ['[]', {}, 400], ['x'.repeat(4097), {}, 413], [{ password: 'x'.repeat(257) }, {}, 400]]) {
      assert.equal((await f.request('/api/admin/login', { body, headers })).status, status)
    }
    assert.equal((await f.request('/api/admin/products', { body: product })).status, 401)
    assert.equal((await f.request('/api/admin/products', { body: product, cookie: auth.cookie })).status, 403)
    assert.equal((await f.request('/api/admin/products', { ...auth, csrf: '0'.repeat(64), body: product })).status, 403)
    assert.equal((await f.request('/api/admin/products', { ...auth, body: product, headers: { Origin: 'https://attacker.example' } })).status, 403)
    assert.equal((await f.request('/api/admin/products', { ...auth, body: product, headers: { 'Content-Type': 'text/plain' } })).status, 415)
    assert.equal((await f.request('/api/admin/products', { ...auth, body: 'x'.repeat(1048577) })).status, 413)
    for (const path of ['/hosting-bridge.php', '/api/%2fprivate', '/shared/php-config.json']) assert.equal((await f.request(path)).status, 404)
    assert.deepEqual(await content(), { products: [], articles: [], hiddenArticles: [] })
  })

  await t.test('products and articles publish, update, hide and survive process replacement', async () => {
    const auth = await f.login()
    const save = (path, body) => f.request('/api/admin/' + path, { ...auth, body })
    assert.equal((await save('products', product)).status, 200)
    assert.equal((await save('products', { catalogNumber: 9000, price: 95, hidden: true })).status, 200)
    assert.equal((await save('products', { catalogNumber: 1, price: 85 })).status, 200)
    assert.equal((await save('articles', article)).status, 200)
    assert.equal((await f.request('/api/content/articles/' + article.slug)).json.blocks[0].text, article.blocks[0].text)
    assert.equal((await save('articles', { slug: article.slug, title: 'Исправленный заголовок' })).status, 200)
    assert.equal((await save('article-visibility', { slug: article.slug, hidden: true })).status, 200)
    assert.equal((await f.request('/api/content/articles/' + article.slug)).status, 404)
    const saved = await content()
    assert.equal(saved.products.find((p) => p.catalogNumber === 1).name, 'Мак пионовидный')
    assert.equal(saved.products.find((p) => p.catalogNumber === 9000).hidden, true)
    await f.restart()
    assert.deepEqual(await content(), saved)
    assert.equal((await save('article-visibility', { slug: article.slug, hidden: false })).status, 200)
    assert.equal((await f.request('/api/content/articles/' + article.slug)).json.title, 'Исправленный заголовок')
  })

  await t.test('validation failures leave durable content and visibility unchanged', async () => {
    const auth = await f.login(), before = await content()
    const file = join(f.shared, 'content/content.json'), bytes = await readFile(file)
    for (const body of [{ ...product, price: -1 }, { ...product, sourceUrl: 'javascript:alert(1)' }, { ...product, image: { src: './images/../private', alt: '' } }]) {
      assert.equal((await f.request('/api/admin/products', { ...auth, body })).status, 400)
    }
    assert.equal((await f.request('/api/admin/articles', { ...auth, body: { ...article, blocks: [], hidden: true } })).status, 400)
    assert.equal((await f.request('/api/admin/article-visibility', { ...auth, body: { slug: 'missing', hidden: true } })).status, 404)
    assert.deepEqual(await content(), before)
    assert.deepEqual(await readFile(file), bytes)
  })

  await t.test('six concurrent updates all reach the durable file', async () => {
    const auth = await f.login()
    const numbers = Array.from({ length: 6 }, (_, i) => 9100 + i)
    const results = await Promise.all(numbers.map((catalogNumber) => f.request('/api/admin/products', { ...auth, body: { ...product, catalogNumber } })))
    assert.ok(results.every((r) => r.status === 200))
    await f.restart()
    const saved = JSON.parse(await readFile(join(f.shared, 'content/content.json'), 'utf8'))
    assert.deepEqual(saved.products.filter((p) => numbers.includes(p.catalogNumber)).map((p) => p.catalogNumber), numbers)
    assert.deepEqual(await content(), saved)
  })

  await t.test('ten guesses persistently throttle login for fifteen minutes', async () => {
    const directory = join(f.shared, 'login-attempts')
    for (const name of await readdir(directory)) if (name.endsWith('.json')) await rm(join(directory, name))
    const started = Math.floor(Date.now() / 1000)
    for (let i = 0; i < 10; i++) assert.equal((await f.request('/api/admin/login', { body: { password: 'wrong' } })).status, 401)
    const limited = await f.request('/api/admin/login', { body: { password } })
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get('retry-after')) > 0 && Number(limited.headers.get('retry-after')) <= 900)
    await f.restart()
    assert.equal((await f.request('/api/admin/login', { body: { password } })).status, 429)
    const file = join(directory, (await readdir(directory)).find((name) => name.endsWith('.json')))
    const state = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(state.count, 10)
    assert.ok(state.reset_at >= started + 900 && state.reset_at <= Math.floor(Date.now() / 1000) + 900)
    await writeFile(file, JSON.stringify({ count: 10, reset_at: 1 }))
    await f.login()
    assert.equal(JSON.parse(await readFile(file, 'utf8')).count, 0)
  })
})
