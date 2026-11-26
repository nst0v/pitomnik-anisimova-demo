import { expect, test } from '@playwright/test'

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]

for (const viewport of viewports) {
  test(`layout ${viewport.width}px has no horizontal overflow or broken images`, async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    for (const image of await page.locator('img').all()) {
      await image.scrollIntoViewIfNeeded()
    }
    await page.locator('#contacts').scrollIntoViewIfNeeded()
    await expect.poll(() => page.locator('img').evaluateAll((images) =>
      images.every((image) => (image as HTMLImageElement).complete),
    )).toBe(true)

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }))
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport)

    const horizontallyClippedControls = await page.locator('button, a, input, textarea').evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
        })
        .map((element) => (element.textContent || element.getAttribute('aria-label') || element.tagName).trim()),
    )
    expect(horizontallyClippedControls).toEqual([])

    const brokenImages = await page.locator('img').evaluateAll((images) =>
      images.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0)
        .map((image) => (image as HTMLImageElement).src),
    )
    expect(brokenImages).toEqual([])

    const requestButtonBox = await page.getByRole('button', { name: /Моя заявка/ }).boundingBox()
    expect(requestButtonBox).not.toBeNull()
    expect(requestButtonBox!.x).toBeGreaterThanOrEqual(0)
    expect(requestButtonBox!.x + requestButtonBox!.width).toBeLessThanOrEqual(viewport.width)
    expect(consoleErrors).toEqual([])

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/layout-${viewport.width}.png`, fullPage: true })
    if (viewport.width === 360) {
      await page.locator('#about').screenshot({ path: 'test-results/mobile-about.png' })
      await page.locator('#contacts').screenshot({ path: 'test-results/mobile-contacts.png' })
    }
  })
}

test('search, categories, details and empty results work with the full catalog', async ({ page }) => {
  await page.goto('/')
  const search = page.locator('input[type="search"]')

  await expect(page.locator('.plant-card')).toHaveCount(24)
  await page.getByRole('button', { name: /Показать ещё 24/ }).click()
  await expect(page.locator('.plant-card')).toHaveCount(48)
  await search.fill('40')
  await expect(page.locator('.plant-card')).toHaveCount(1)
  await expect(page.locator('.plant-card')).toContainText('Купальница азиатская')

  await search.fill('Мак пионовидный')
  await expect(page.locator('.plant-card')).toHaveCount(1)
  await expect(page.locator('.plant-card')).toContainText('60 ₽')

  await search.fill('несуществующее растение')
  await expect(page.locator('.plant-card')).toHaveCount(0)
  await expect(page.locator('.empty-results')).toBeVisible()
  await page.getByRole('button', { name: 'Показать все растения' }).click()
  await expect(page.locator('.plant-card').first()).toBeVisible()

  await page.getByRole('button', { name: /^Однолетники/ }).click()
  await expect(page.locator('.plant-card')).toHaveCount(5)
  await page.getByRole('button', { name: /Сбросить фильтры/ }).click()

  await search.fill('Головчатка гигантская')
  const plantCard = page.locator('.plant-card').first()
  await plantCard.getByRole('button', { name: 'Подробнее' }).click()
  const dialog = page.locator('.detail-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Головчатка гигантская' })).toBeVisible()
  await expect(dialog).toContainText('50 ₽')
  await dialog.getByRole('button', { name: /Добавить в заявку/ }).click()
  await dialog.getByRole('button', { name: 'Закрыть подробности' }).click()
  await expect(page.getByRole('button', { name: /Моя заявка, выбрано позиций: 1/ })).toBeVisible()
})

test('request quantities, persistence, delivery, copying, mail text and removal work', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4175' })
  await page.goto('/')

  const plantCard = page.locator('.plant-card').filter({ hasText: 'Мак пионовидный' })
  await plantCard.getByRole('button', { name: 'В заявку' }).click()
  await plantCard.getByRole('button', { name: /В заявке: 1/ }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /Моя заявка, выбрано позиций: 1/ })).toBeVisible()

  await page.getByRole('button', { name: /Моя заявка, выбрано позиций: 1/ }).click()
  const requestDialog = page.locator('.request-dialog')
  await expect(requestDialog).toBeVisible()
  await expect(requestDialog.locator('.quantity-control output')).toHaveText('2')

  await requestDialog.getByLabel(/Ф.И.О|Фамилия|Ваше имя/).fill('Иванова Ирина Павловна')
  await requestDialog.getByLabel('Телефон или электронная почта').fill('irina@example.com')
  await requestDialog.getByLabel(/Адрес/).fill('634000, Томск, ул. Садовая, 1')
  await requestDialog.getByLabel(/Комментарий/).fill('Удобна доставка по почте.')
  await requestDialog.getByText('Посмотреть текст заявки').click()
  await expect(requestDialog.locator('pre')).toContainText('№ 1 — Мак пионовидный — 2 × Пакет, 50 семян')
  await expect(requestDialog.locator('pre')).toContainText('120 ₽')
  await expect(requestDialog.locator('pre')).toContainText('510 ₽')
  await expect(requestDialog.locator('pre')).toContainText('634000, Томск')
  await expect(requestDialog.locator('pre')).not.toContainText('демоверсии')

  await requestDialog.getByRole('button', { name: /Скопировать заявку/ }).click()
  await expect(requestDialog.getByRole('button', { name: /Текст заявки скопирован/ })).toBeVisible()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('Мак пионовидный')
  expect(clipboard).toContain('irina@example.com')

  const mailLink = requestDialog.getByRole('link', { name: 'Открыть письмо' })
  const href = await mailLink.getAttribute('href')
  expect(href).toContain('mailto:sem-ot-anis@mail.ru')
  expect(decodeURIComponent(href!)).toContain('Мак пионовидный')
  expect(decodeURIComponent(href!)).toContain('634000, Томск')

  await requestDialog.getByRole('button', { name: 'Уменьшить количество' }).click()
  await expect(requestDialog.locator('.quantity-control output')).toHaveText('1')
  await requestDialog.getByRole('button', { name: 'Удалить' }).click()
  await expect(requestDialog.getByRole('heading', { name: 'В заявке пока пусто' })).toBeVisible()
  await requestDialog.getByRole('button', { name: 'Закрыть заявку' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /Моя заявка, выбрано позиций: 0/ })).toBeVisible()
})

test('minimum planting quantity and volume prices work', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="search"]').fill('Медуница мягчайшая')
  const plantCard = page.locator('.plant-card').first()
  await plantCard.getByRole('button', { name: 'В заявку' }).click()
  await page.getByRole('button', { name: /Моя заявка, выбрано позиций: 1/ }).click()
  const dialog = page.locator('.request-dialog')
  await expect(dialog.locator('.quantity-control output')).toHaveText('2')
  await expect(dialog.locator('.cart-line-total')).toHaveText('480 ₽')
  await dialog.getByRole('button', { name: 'Увеличить количество' }).click()
  await expect(dialog.locator('.quantity-control output')).toHaveText('3')
  await expect(dialog.locator('.cart-line-total')).toHaveText('570 ₽')
  await dialog.getByRole('spinbutton', { name: /Количество: Медуница/ }).fill('10')
  await dialog.getByRole('spinbutton', { name: /Количество: Медуница/ }).press('Enter')
  await expect(dialog.locator('.quantity-control output')).toHaveText('10')
  await expect(dialog.locator('.cart-line-total')).toHaveText('1 900 ₽')
  await dialog.getByLabel('Способ доставки').selectOption('ozon')
  await expect(dialog.locator('.cart-summary')).toContainText('390 ₽')

  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /Скачать заявку файлом/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('zakaz-anisimov-2027.txt')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(chunk)
  const request = Buffer.concat(chunks).toString('utf8')
  expect(request).toContain('198-10')
  expect(request).toMatch(/2\s290 ₽/)
})

test('mobile request and details dialogs fit at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')

  const plantCard = page.locator('.plant-card').filter({ hasText: 'Мак пионовидный' })
  await plantCard.getByRole('button', { name: 'Подробнее' }).click()
  const detailDialog = page.locator('.detail-dialog')
  await expect(detailDialog).toBeVisible()
  expect(await detailDialog.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true)
  await detailDialog.getByRole('button', { name: /Добавить в заявку/ }).click()
  await detailDialog.getByRole('button', { name: 'Закрыть подробности' }).click()

  await page.getByRole('button', { name: /Моя заявка, выбрано позиций: 1/ }).click()
  const requestDialog = page.locator('.request-dialog')
  await expect(requestDialog).toBeVisible()
  expect(await requestDialog.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true)
  const box = await requestDialog.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(360)
  await page.screenshot({ path: 'test-results/mobile-request-top.png' })

  await requestDialog.evaluate((dialog) => dialog.scrollTo(0, dialog.scrollHeight))
  await expect(requestDialog.getByRole('link', { name: 'Открыть письмо' })).toBeVisible()
  await expect(requestDialog.getByRole('button', { name: 'Закрыть заявку' })).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-request-bottom.png' })
})

test('the original Word catalog is downloadable and published copy has no demonstration labels', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('body')).not.toContainText(/демоверси|демонстрацион|архивные цены|истёкшего каталога/i)
  const catalog = page.locator('a[href$="catalog-2027.docx"]').first()
  await expect(catalog).toBeVisible()
  const response = await request.get((await catalog.getAttribute('href'))!)
  expect(response.ok()).toBe(true)
  const data = await response.body()
  expect(data.subarray(0, 2).toString()).toBe('PK')
})
