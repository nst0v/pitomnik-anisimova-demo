import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

type UploadedArticle = {
  slug: string
  title: string
  sourceFile: string
  downloadUrl: string
  category: string
}

const ownerFiles = new Set([
  'Альфредия с фото.doc',
  'Кат-Безвременник.doc.dot',
  'Кат-Кандык.doc',
  'Кат-Купальница.doc',
  'Кат-Черемша.doc',
])

const getArticleIndex = () => JSON.parse(
  readFileSync(new URL('../src/data/article-index.json', import.meta.url), 'utf8'),
) as UploadedArticle[]

const getUploadedArticles = () => getArticleIndex().filter((article) => ownerFiles.has(article.sourceFile))

test('articles navigation, search, filters and reading links work', async ({ page }) => {
  await page.goto('/')
  await page.locator('.main-nav').getByRole('link', { name: 'Статьи', exact: true }).click()
  await expect(page).toHaveURL(/#\/articles$/)
  await expect(page.locator('.article-card').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Все статьи/ })).toContainText('41')
  await expect(page.getByRole('button', { name: /^Новые на сайте/ })).toHaveCount(0)

  const search = page.locator('.article-search input, input.article-search')
  await search.fill('черемша')
  await expect(page.locator('.article-card')).toHaveCount(1)
  await expect(page.locator('.article-card')).toContainText(/черемша/i)
  await search.fill('несуществующее растение')
  await expect(page.locator('.article-card')).toHaveCount(0)
  await expect(page.getByText(/не найдены|ничего не найдено/i).first()).toBeVisible()

  await search.clear()
  const category = getUploadedArticles()[0].category
  await page.getByRole('button', { name: new RegExp('^' + category) }).click()
  await expect(page.locator('.article-card').first()).toBeVisible()
  for (const metadata of await page.locator('.article-card-meta').all()) await expect(metadata).toContainText(category)
  await page.getByRole('button', { name: /^Все статьи/ }).click()
  const showMore = page.getByRole('button', { name: /^Показать ещё статьи/ })
  for (let count = 0; count < 4 && await showMore.count(); count++) await showMore.click()
  await expect(page.locator('.article-card')).toHaveCount(41)
  for (const article of getUploadedArticles()) {
    await expect(page.locator('.article-card').filter({ hasText: article.title })).toHaveCount(1)
  }
})

test('uploaded articles have full readable text, shareable URLs and related catalog links', async ({ page }) => {
  const article = getUploadedArticles().find((entry) => /купальница/i.test(entry.title))!
  await page.goto(`/#/articles/${article.slug}`)
  const reader = page.locator('.article-reader')
  await expect(reader).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible()
  expect((await reader.innerText()).length).toBeGreaterThan(3000)
  await expect(reader.locator(`a[href="${article.downloadUrl}"]`)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible()
  await expect(reader).toContainText('Анисимов')

  await expect(reader.getByRole('link', { name: /Предыдущая версия/i })).toHaveCount(0)

  const relatedCatalog = reader.locator('a[href="#catalog"]').first()
  await expect(relatedCatalog).toBeVisible()
  await relatedCatalog.click()
  await expect(page.locator('#catalog')).toBeVisible()
  await expect(page.locator('.plant-card')).toHaveCount(1)
  await expect(page.locator('.plant-card')).toContainText('Купальница азиатская')
  await expect(page.locator('.article-reader')).toHaveCount(0)
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible()
})

test('all five downloadable Word originals are unchanged binary documents', async ({ request }) => {
  const articles = getUploadedArticles()
  expect(articles).toHaveLength(5)
  for (const article of articles) {
    const response = await request.get(article.downloadUrl)
    expect(response.ok(), article.title).toBe(true)
    const downloaded = await response.body()
    expect(downloaded.subarray(0, 8).toString('hex')).toBe('d0cf11e0a1b11ae1')
    expect(downloaded.equals(readFileSync(new URL(`../${article.sourceFile}`, import.meta.url))), article.title).toBe(true)
  }
})

for (const width of [360, 390]) {
  test(`articles and long article text fit a ${width}px screen`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/#/articles')
    const firstArticleLink = page.locator('.article-card a[href^="#/articles/"]').first()
    await firstArticleLink.click()
    await expect(page.locator('.article-reader')).toBeVisible()
    await page.locator('.article-reader').evaluate((reader) => reader.scrollIntoView())

    const layout = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      reader: document.querySelector('.article-reader')!.scrollWidth,
      readerWidth: document.querySelector('.article-reader')!.clientWidth,
    }))
    expect(layout.document).toBeLessThanOrEqual(layout.viewport)
    expect(layout.reader).toBeLessThanOrEqual(layout.readerWidth)
    expect(errors).toEqual([])
    await page.screenshot({ path: `test-results/articles-${width}.png`, fullPage: true })
  })
}
