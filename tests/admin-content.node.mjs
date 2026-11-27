import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContentHandler } from '../server/content.mjs'

const token = 'test-session-csrf-token'
const product = { catalogNumber: 213, name: 'Новый пион', category: 'perennials', description: 'Описание нового растения.', unit: 'Пакет семян', price: 125 }
const article = { slug: 'novaya-statya', title: 'Новая статья', blocks: [{ type: 'paragraph', text: 'Как вырастить красивый сад.' }] }

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nursery-content-'))
  let handler = createContentHandler({ dataDirectory: directory })
  const server = createServer(async (req, res) => {
    const handled = await handler(req, res, { authenticated: req.headers.authorization === 'test-admin', csrfToken: token })
    if (!handled) { res.writeHead(404); res.end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  return {
    origin, directory,
    restart: () => { handler = createContentHandler({ dataDirectory: directory }) },
    get: (path) => fetch(origin + path),
    post: (path, body, headers = {}) => fetch(origin + path, { method: 'POST', headers: { authorization: 'test-admin', 'content-type': 'application/json', 'x-csrf-token': token, origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
  }
}

test('product additions and price edits persist across handler restarts without changing original catalog', async (t) => {
  const f = await fixture(t)
  assert.deepEqual(await (await f.get('/site-content.json')).json(), { products: [], articles: [], hiddenArticles: [] })
  assert.equal((await f.post('/api/admin/products', product)).status, 200)
  const edited = await f.post('/api/admin/products', { catalogNumber: 1, price: 85 })
  assert.equal(edited.status, 200)
  const saved = (await edited.json()).content
  assert.equal(saved.products.find((item) => item.catalogNumber === 1).name, 'Мак пионовидный')
  assert.equal(saved.products.find((item) => item.catalogNumber === 1).price, 85)
  f.restart()
  assert.deepEqual(await (await f.get('/site-content.json')).json(), saved)
  const persisted = JSON.parse(await readFile(join(f.directory, 'content.json'), 'utf8'))
  assert.deepEqual(persisted, saved)
  assert.equal((await stat(join(f.directory, 'content.json'))).mode & 0o777, 0o600)
})

test('writes require an authenticated session, a valid CSRF token and same origin', async (t) => {
  const f = await fixture(t)
  assert.equal((await f.post('/api/admin/products', product, { authorization: '' })).status, 401)
  assert.equal((await f.post('/api/admin/products', product, { 'x-csrf-token': '' })).status, 403)
  assert.equal((await f.post('/api/admin/products', product, { 'x-csrf-token': 'incorrect' })).status, 403)
  assert.equal((await f.post('/api/admin/products', product, { origin: 'https://other-site.example' })).status, 403)
  assert.deepEqual((await (await f.get('/site-content.json')).json()).products, [])
})

test('invalid product data and dangerous URL schemes cannot be saved', async (t) => {
  const f = await fixture(t)
  for (const patch of [
    { price: -1 }, { price: '99' }, { price: 10000001 }, { catalogNumber: 0 },
    { name: '' }, { category: 'unknown' }, { minimumQuantity: 0 },
    { sourceUrl: 'javascript:alert(1)' }, { image: { src: 'data:image/svg+xml,test', alt: '', sourceUrl: '' } },
    { image: { src: './images/../secret', alt: '', sourceUrl: '' } },
    { priceTiers: [{ minQuantity: 2, price: null }] },
    { priceTiers: [{ minQuantity: 2, price: 10 }, { minQuantity: 2, price: 15 }] },
  ]) assert.equal((await f.post('/api/admin/products', { ...product, ...patch })).status, 400, JSON.stringify(patch))
  assert.equal((await f.post('/api/admin/products', '{broken')).status, 400)
  assert.equal((await f.post('/api/admin/products', product, { 'content-type': 'text/plain' })).status, 415)
  assert.deepEqual((await (await f.get('/site-content.json')).json()).products, [])
})

test('articles can be published, read, edited and hidden while retaining text safely', async (t) => {
  const f = await fixture(t)
  const published = await f.post('/api/admin/articles', { ...article, blocks: [{ type: 'paragraph', text: '<script>alert("hello")</script> — обычный текст' }] })
  assert.equal(published.status, 200)
  const stored = (await published.json()).content.articles[0]
  assert.equal(stored.contentUrl, './api/content/articles/novaya-statya')
  assert.equal(stored.author, 'Геннадий Павлович Анисимов')
  assert.equal(stored.contentStatus, 'full')
  const reader = await f.get('/api/content/articles/novaya-statya')
  assert.equal(reader.status, 200)
  assert.match(reader.headers.get('content-type'), /application\/json/)
  assert.equal((await reader.json()).blocks[0].text, '<script>alert("hello")</script> — обычный текст')
  assert.equal((await f.post('/api/admin/articles', { ...article, title: 'Исправленный заголовок' })).status, 200)
  assert.equal((await (await f.get('/api/content/articles/novaya-statya')).json()).title, 'Исправленный заголовок')
  assert.equal((await f.post('/api/admin/article-visibility', { slug: article.slug, hidden: true })).status, 200)
  assert.equal((await f.get('/api/content/articles/novaya-statya')).status, 404)
  f.restart()
  assert.deepEqual((await (await f.get('/site-content.json')).json()).hiddenArticles, [article.slug])
  assert.equal((await f.post('/api/admin/article-visibility', { slug: article.slug, hidden: false })).status, 200)
  assert.equal((await f.get('/api/content/articles/novaya-statya')).status, 200)
  assert.equal((await f.post('/api/admin/article-visibility', { slug: 'missing', hidden: true })).status, 404)
})

test('invalid articles and oversized requests fail without altering saved content', async (t) => {
  const f = await fixture(t)
  for (const patch of [{ slug: '../../secret' }, { slug: '%2e%2e' }, { blocks: [] }, { blocks: [{ type: 'html', text: 'x' }] }, { blocks: [{ type: 'paragraph', text: '' }] }, { downloadUrl: 'javascript:alert(1)' }]) {
    assert.equal((await f.post('/api/admin/articles', { ...article, ...patch })).status, 400)
  }
  assert.equal((await f.post('/api/admin/articles', JSON.stringify({ ...article, excerpt: 'а'.repeat(1024 * 1024) }))).status, 413)
  assert.deepEqual((await (await f.get('/site-content.json')).json()).articles, [])
})

test('concurrent product updates are serialized instead of overwriting one another', async (t) => {
  const f = await fixture(t)
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => f.post('/api/admin/products', { ...product, catalogNumber: 213 + i })))
  assert.ok(responses.every((response) => response.status === 200))
  assert.equal((await (await f.get('/site-content.json')).json()).products.length, 8)
})

test('saving article text and visibility is atomic, including failed validation', async (t) => {
  const f = await fixture(t)
  assert.equal((await f.post('/api/admin/articles', { ...article, hidden: true })).status, 200)
  let content = await (await f.get('/site-content.json')).json()
  assert.equal(content.articles[0].title, article.title)
  assert.deepEqual(content.hiddenArticles, [article.slug])
  assert.equal((await f.get(`/api/content/articles/${article.slug}`)).status, 404)
  assert.equal((await f.post('/api/admin/articles', { ...article, title: '', hidden: false })).status, 400)
  assert.equal((await f.post('/api/admin/articles', { ...article, title: 'Не сохранять', hidden: 'false' })).status, 400)
  content = await (await f.get('/site-content.json')).json()
  assert.equal(content.articles[0].title, article.title)
  assert.deepEqual(content.hiddenArticles, [article.slug])
  assert.equal((await f.post('/api/admin/articles', { ...article, title: 'Теперь опубликована', hidden: false })).status, 200)
  content = await (await f.get('/site-content.json')).json()
  assert.equal(content.articles[0].title, 'Теперь опубликована')
  assert.deepEqual(content.hiddenArticles, [])
})

test('all existing catalog products and complete original articles retain their metadata through editing', async (t) => {
  const f = await fixture(t)
  const originalProducts = JSON.parse(await readFile(new URL('../src/data/catalog-2027.json', import.meta.url), 'utf8'))
  // The image mapping is generated as a JSON object inside its TypeScript export.
  const imageSource = await readFile(new URL('../src/data/plant-images.ts', import.meta.url), 'utf8')
  const images = JSON.parse(imageSource.slice(imageSource.indexOf('= {') + 2))
  for (const original of originalProducts) {
    const expected = { ...original, ...(images[original.catalogNumber] ? { image: images[original.catalogNumber] } : {}) }
    const response = await f.post('/api/admin/products', expected)
    const body = await response.json()
    assert.equal(response.status, 200, `Product ${original.catalogNumber}: ${JSON.stringify(body)}`)
    assert.deepEqual(body.content.products.find((item) => item.catalogNumber === original.catalogNumber), expected, `Product ${original.catalogNumber} retains source fields and photograph credits`)
  }
  const index = JSON.parse(await readFile(new URL('../src/data/article-index.json', import.meta.url), 'utf8'))
  for (const summary of index) {
    const original = JSON.parse(await readFile(new URL(`../public/${summary.contentUrl.slice(2)}`, import.meta.url), 'utf8'))
    const response = await f.post('/api/admin/articles', { ...summary, blocks: original.blocks })
    const body = await response.json()
    assert.equal(response.status, 200, `Article ${summary.slug}: ${JSON.stringify(body)}`)
    const saved = body.content.articles.find((item) => item.slug === summary.slug)
    assert.deepEqual(saved.blocks, original.blocks, `${summary.slug} retains paragraphs, headings, images and source credits`)
    for (const field of ['title', 'excerpt', 'category', 'author', 'origin', 'plantNumbers', 'sourceUrl', 'sourceFile', 'downloadUrl', 'originalDocumentUrl', 'featured', 'coverImage']) {
      assert.deepEqual(saved[field], summary[field], `${summary.slug} retains ${field}`)
    }
  }
  const content = await (await f.get('/site-content.json')).json()
  assert.equal(content.products.length, originalProducts.length)
  assert.equal(content.articles.length, index.length)
})
