import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { isSameOrigin } from './auth.mjs'

const baseProducts = JSON.parse(await readFile(new URL('../src/data/catalog-2027.json', import.meta.url), 'utf8'))
const baseArticles = JSON.parse(await readFile(new URL('../src/data/article-index.json', import.meta.url), 'utf8'))
const categories = new Set(['annuals', 'perennials', 'useful', 'planting', 'catalog'])
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const emptyContent = () => ({ products: [], articles: [], hiddenArticles: [] })

class ContentError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}

function object(value, label = 'Данные') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContentError(400, `${label}: неверный формат.`)
  return value
}

function text(value, label, maximum = 2000, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())) throw new ContentError(400, `Проверьте поле «${label}».`)
  return value.trim()
}

function integer(value, label, maximum = 999999) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new ContentError(400, `Проверьте поле «${label}».`)
  return value
}

function price(value) {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000000)) throw new ContentError(400, 'Укажите цену от 0 до 10 000 000 рублей.')
  return value
}

function slug(value) {
  if (typeof value !== 'string' || value.length > 160 || !slugPattern.test(value)) throw new ContentError(400, 'Неверный адрес статьи.')
  return value
}

function safeUrl(value, label, { image = false, allowEmpty = false } = {}) {
  const result = text(value, label, 3000, allowEmpty)
  if (allowEmpty && !result) return result
  if (/[\s\\\u0000-\u001f]/.test(result)) throw new ContentError(400, `Проверьте ссылку «${label}».`)
  if (result.startsWith('./') && !result.includes('..', 2) && !/%(?:2e|2f|5c)/i.test(result)) {
    if (!image || /^\.\/(?:images|articles\/images)\//.test(result)) return result
  }
  try {
    const url = new URL(result)
    if ((url.protocol === 'https:' || (!image && url.protocol === 'http:')) && !url.username && !url.password) return result
  } catch { /* Invalid URLs receive the same helpful error as unsafe schemes. */ }
  throw new ContentError(400, `Проверьте ссылку «${label}».`)
}

function plantImage(value) {
  object(value, 'Изображение')
  const result = {
    src: safeUrl(value.src, 'Изображение', { image: true }),
    alt: text(value.alt ?? '', 'Описание изображения', 1000, true),
    sourceUrl: safeUrl(value.sourceUrl ?? '', 'Источник изображения', { allowEmpty: true }),
  }
  if (value.attribution !== undefined) {
    object(value.attribution, 'Автор изображения')
    result.attribution = {
      author: text(value.attribution.author, 'Автор изображения', 300),
      license: text(value.attribution.license, 'Лицензия', 300),
      licenseUrl: safeUrl(value.attribution.licenseUrl, 'Лицензия'),
    }
  }
  return result
}

function validateProduct(input, existing) {
  const value = { ...existing, ...object(input, 'Товар') }
  if (!categories.has(value.category)) throw new ContentError(400, 'Выберите категорию товара.')
  const result = {
    catalogNumber: integer(value.catalogNumber, 'Номер товара'),
    name: text(value.name, 'Название товара', 500),
    description: text(value.description, 'Описание товара', 50000),
    category: value.category,
    unit: text(value.unit, 'Единица продажи', 500),
    price: price(value.price),
    sourceUrl: safeUrl(value.sourceUrl ?? '', 'Источник товара', { allowEmpty: true }),
  }
  for (const field of ['latinName', 'note', 'priceNote', 'shippingNote']) {
    if (value[field] !== undefined) result[field] = text(value[field], field, 10000, true)
  }
  for (const field of ['minimumQuantity', 'quantityStep']) {
    if (value[field] !== undefined) result[field] = integer(value[field], field, 999)
  }
  for (const field of ['hidden', 'shippingIncluded']) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== 'boolean') throw new ContentError(400, `Проверьте поле «${field}».`)
      result[field] = value[field]
    }
  }
  if (value.priceTiers !== undefined) {
    if (!Array.isArray(value.priceTiers) || value.priceTiers.length > 20) throw new ContentError(400, 'Проверьте цены за количество.')
    result.priceTiers = value.priceTiers.map((tier) => {
      object(tier, 'Цена за количество')
      const tierPrice = price(tier.price)
      if (tierPrice === null) throw new ContentError(400, 'Укажите цену за количество.')
      return { minQuantity: integer(tier.minQuantity, 'Количество', 999), price: tierPrice }
    })
    if (new Set(result.priceTiers.map((tier) => tier.minQuantity)).size !== result.priceTiers.length) throw new ContentError(400, 'Количество в ценах не должно повторяться.')
  }
  if (value.image !== undefined) result.image = plantImage(value.image)
  return result
}

function validateArticle(input, existing) {
  const value = { ...existing, ...object(input, 'Статья') }
  const articleSlug = slug(value.slug)
  if (!Array.isArray(value.blocks) || value.blocks.length === 0 || value.blocks.length > 2000) throw new ContentError(400, 'Напишите текст статьи.')
  const blocks = value.blocks.map((block) => {
    object(block, 'Текст статьи')
    if (block.type === 'paragraph' || block.type === 'heading') return { type: block.type, text: text(block.text, 'Текст статьи', 100000) }
    if (block.type === 'list' && Array.isArray(block.items) && block.items.length > 0 && block.items.length <= 500) return { type: 'list', items: block.items.map((item) => text(item, 'Текст списка', 20000)) }
    if (block.type === 'image') {
      return {
        type: 'image',
        src: safeUrl(block.src, 'Изображение в статье', { image: true }),
        alt: text(block.alt ?? '', 'Описание изображения', 1000, true),
        ...(block.caption === undefined ? {} : { caption: text(block.caption, 'Подпись изображения', 2000, true) }),
        ...(block.text === undefined ? {} : { text: text(block.text, 'Подпись изображения', 2000, true) }),
        ...(block.sourceUrl === undefined ? {} : { sourceUrl: safeUrl(block.sourceUrl, 'Источник изображения') }),
      }
    }
    throw new ContentError(400, 'Проверьте текст статьи.')
  })
  const bodyText = blocks.map((block) => block.text ?? block.items?.join(' ') ?? '').join(' ')
  if (!bodyText.trim()) throw new ContentError(400, 'Напишите текст статьи.')
  const result = {
    slug: articleSlug,
    title: text(value.title, 'Название статьи', 500),
    excerpt: text(value.excerpt ?? bodyText.slice(0, 200), 'Краткое описание', 3000),
    category: text(value.category ?? 'Советы садоводу', 'Раздел статьи', 200),
    author: text(value.author ?? 'Геннадий Павлович Анисимов', 'Автор статьи', 300),
    origin: value.origin === 'archive' ? 'archive' : 'new',
    contentStatus: 'full',
    contentUrl: `./api/content/articles/${articleSlug}`,
    readingMinutes: Math.max(1, Math.ceil(bodyText.split(/\s+/).length / 180)),
    plantNumbers: [],
    blocks,
  }
  if (value.plantNumbers !== undefined) {
    if (!Array.isArray(value.plantNumbers) || value.plantNumbers.length > 1000) throw new ContentError(400, 'Проверьте связанные товары.')
    result.plantNumbers = [...new Set(value.plantNumbers.map((number) => integer(number, 'Номер связанного товара')))]
  }
  for (const field of ['sourceUrl', 'downloadUrl', 'originalDocumentUrl']) {
    if (value[field] !== undefined && value[field] !== '') result[field] = safeUrl(value[field], field)
  }
  if (value.sourceFile !== undefined) result.sourceFile = text(value.sourceFile, 'Исходный документ', 500, true)
  if (value.coverImage !== undefined) result.coverImage = plantImage(value.coverImage)
  if (value.featured !== undefined) {
    if (typeof value.featured !== 'boolean') throw new ContentError(400, 'Проверьте настройку избранной статьи.')
    result.featured = value.featured
  }
  return result
}

function readJson(req, limit = 1024 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new ContentError(415, 'Данные должны быть в формате JSON.')
  return new Promise((resolveBody, reject) => {
    let size = 0
    let tooLarge = false
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        if (!tooLarge) reject(new ContentError(413, 'Слишком много текста. Разделите статью на несколько частей.'))
        tooLarge = true
        chunks.length = 0
      } else if (!tooLarge) chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return
      try { resolveBody(object(JSON.parse(Buffer.concat(chunks).toString('utf8')))) }
      catch (error) { reject(error instanceof ContentError ? error : new ContentError(400, 'Не удалось прочитать данные.')) }
    })
    req.on('error', reject)
    req.on('aborted', () => reject(new ContentError(400, 'Загрузка данных прервана.')))
  })
}

function authorize(req, session) {
  if (!session?.authenticated) throw new ContentError(401, 'Войдите в кабинет ещё раз.')
  const supplied = req.headers['x-csrf-token']
  const expected = session.csrfToken
  const suppliedBytes = typeof supplied === 'string' && supplied.length <= 300 ? Buffer.from(supplied) : null
  const expectedBytes = typeof expected === 'string' ? Buffer.from(expected) : null
  if (!isSameOrigin(req) || !suppliedBytes || !expectedBytes || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) throw new ContentError(403, 'Обновите страницу и попробуйте сохранить ещё раз.')
}

/** Persistent content overrides; the original imported catalog and articles remain intact. */
export function createContentHandler({ dataDirectory = '.admin-data' } = {}) {
  const directory = resolve(dataDirectory)
  const file = join(directory, 'content.json')
  let contentPromise
  let writes = Promise.resolve()

  const load = () => {
    contentPromise ??= readFile(file, 'utf8').then((raw) => {
      const value = object(JSON.parse(raw), 'Сохранённые данные')
      if (!Array.isArray(value.products) || !Array.isArray(value.articles) || !Array.isArray(value.hiddenArticles)) throw new Error('Invalid saved content shape')
      return { products: value.products, articles: value.articles, hiddenArticles: value.hiddenArticles }
    }).catch((error) => {
      if (error.code === 'ENOENT') return emptyContent()
      contentPromise = undefined
      throw error
    })
    return contentPromise
  }

  const update = (mutate) => {
    const operation = writes.then(async () => {
      const current = await load()
      const next = structuredClone(current)
      mutate(next)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const temporary = join(directory, `.content-${randomBytes(12).toString('hex')}.tmp`)
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
        await rename(temporary, file)
      } catch (error) {
        await unlink(temporary).catch(() => {})
        throw error
      }
      contentPromise = Promise.resolve(next)
      return next
    })
    writes = operation.catch(() => {})
    return operation
  }

  return async function contentHandler(req, res, session) {
    let path
    try { path = new URL(req.url ?? '/', 'http://localhost').pathname }
    catch { return false }
    const publicContent = path === '/site-content.json'
    const publicArticle = path.startsWith('/api/content/articles/')
    const mutation = ['/api/admin/products', '/api/admin/articles', '/api/admin/article-visibility'].includes(path)
    if (!publicContent && !publicArticle && !mutation) return false
    try {
      if (publicContent || publicArticle) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new ContentError(405, 'Этот запрос не поддерживается.')
        const content = await load()
        if (publicContent) sendJson(res, 200, content)
        else {
          const requestedSlug = slug(path.slice('/api/content/articles/'.length))
          const article = content.articles.find((item) => item.slug === requestedSlug)
          if (!article || content.hiddenArticles.includes(requestedSlug)) throw new ContentError(404, 'Статья не найдена.')
          sendJson(res, 200, article)
        }
      } else {
        authorize(req, session)
        if (req.method !== 'POST') throw new ContentError(405, 'Этот запрос не поддерживается.')
        const input = await readJson(req)
        const content = await update((next) => {
          if (path === '/api/admin/products') {
            const existing = next.products.find((item) => item.catalogNumber === input.catalogNumber) ?? baseProducts.find((item) => item.catalogNumber === input.catalogNumber)
            const product = validateProduct(input, existing)
            next.products = [...next.products.filter((item) => item.catalogNumber !== product.catalogNumber), product].sort((a, b) => a.catalogNumber - b.catalogNumber)
          } else if (path === '/api/admin/articles') {
            if (input.hidden !== undefined && typeof input.hidden !== 'boolean') throw new ContentError(400, 'Укажите, показывать ли статью на сайте.')
            const existing = next.articles.find((item) => item.slug === input.slug) ?? baseArticles.find((item) => item.slug === input.slug)
            const article = validateArticle(input, existing)
            next.articles = [...next.articles.filter((item) => item.slug !== article.slug), article]
            if (typeof input.hidden === 'boolean') {
              next.hiddenArticles = next.hiddenArticles.filter((item) => item !== article.slug)
              if (input.hidden) next.hiddenArticles.push(article.slug)
            }
          } else {
            const articleSlug = slug(input.slug)
            if (typeof input.hidden !== 'boolean') throw new ContentError(400, 'Укажите, показывать ли статью на сайте.')
            if (!next.articles.some((item) => item.slug === articleSlug) && !baseArticles.some((item) => item.slug === articleSlug)) throw new ContentError(404, 'Статья не найдена.')
            next.hiddenArticles = next.hiddenArticles.filter((item) => item !== articleSlug)
            if (input.hidden) next.hiddenArticles.push(articleSlug)
          }
        })
        sendJson(res, 200, { content })
      }
    } catch (error) {
      req.resume()
      if (!(error instanceof ContentError)) console.error('Admin content request failed:', error)
      sendJson(res, error instanceof ContentError ? error.status : 500, { error: error instanceof ContentError ? error.message : 'Не удалось сохранить данные. Попробуйте ещё раз.' })
    }
    return true
  }
}
