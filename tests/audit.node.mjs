import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { normalizeSearch } from '../src/lib/search.ts'
import { copyText } from '../src/lib/clipboard.ts'
import { buildRequestText, getCartSummary, getOrderEstimate, getUnitPrice } from '../src/lib/request.ts'
import { plants } from '../src/data/plants.ts'

test('search handles Latin diacritics and Russian spelling without conflating letters', () => {
  const matches = plants.filter(p => normalizeSearch(`${p.catalogNumber} ${p.name} ${p.latinName ?? ''}`).includes(normalizeSearch('Bergenia crassifolia')))
  assert.ok(matches.some(p => p.name.includes('Бадан')))
  assert.equal(normalizeSearch('  № 42  '), '42')
  assert.equal(normalizeSearch('Ёлка'), 'елка')
  assert.notEqual(normalizeSearch('й'), normalizeSearch('и'))
})

test('new catalog has unique numbers, current prices and local photographs', () => {
  assert.equal(plants.length, 212, 'the complete saleable catalog replaces the 17-item sample')
  assert.equal(new Set(plants.map(p => p.catalogNumber)).size, plants.length)
  assert.equal(plants.find(p => p.catalogNumber === 1)?.price, 60)
  assert.equal(plants.find(p => p.catalogNumber === 212)?.price, 60)
  for (const plant of plants) {
    assert.ok(plant.name.trim())
    assert.ok(plant.description.trim())
    assert.ok(plant.price > 0, `price is present for №${plant.catalogNumber}`)
    assert.ok(plant.unit)
    assert.ok(plant.minimumQuantity === undefined || plant.minimumQuantity >= 1)
    if (plant.category !== 'catalog') {
      assert.ok(plant.image?.src.startsWith('./images/'), `local plant photo for №${plant.catalogNumber}`)
      assert.ok(existsSync(new URL(`../public/${plant.image.src.slice(2)}`, import.meta.url)), `photo file exists for №${plant.catalogNumber}`)
    }
  }
})

test('downloadable Word file is the exact supplied catalog', () => {
  const original = readFileSync(new URL('../Каталог 2027.docx', import.meta.url))
  const downloadable = readFileSync(new URL('../public/catalog-2027.docx', import.meta.url))
  assert.deepEqual(downloadable, original)
})

test('quantity price tiers apply at their exact thresholds and do not mutate source data', () => {
  const plant = { ...plants[0], price: 240, minimumQuantity: 2, priceTiers: [{ minQuantity: 5, price: 170 }, { minQuantity: 3, price: 190 }] }
  assert.equal(getUnitPrice(plant, 2), 240)
  assert.equal(getUnitPrice(plant, 3), 190)
  assert.equal(getUnitPrice(plant, 5), 170)
  assert.deepEqual(plant.priceTiers.map(t => t.minQuantity), [5, 3])
  assert.equal(getCartSummary([{ plant, quantity: 5 }]).knownTotal, 850)
})

test('request retains current catalog numbers, quantities, contacts and payment state', () => {
  const flower = plants.find(p => p.catalogNumber === 1)
  const request = buildRequestText([{ plant: flower, quantity: 2 }], {
    name: 'Ирина Иванова', contact: 'qa@example.com', address: '634000, Томск', customerCode: '', delivery: 'post', payment: '', comment: ''
  })
  assert.match(request, /Номера по каталогу: 1-2/)
  assert.match(request, /2 × Пакет, 50 семян/)
  assert.match(request, /Стоимость растений без доставки: 120 ₽/)
  assert.match(request, /2026–2027/)
  assert.match(request, /15 октября 2027/)
  assert.match(request, /Пересылка по России \(1 отпр.\): 390 ₽/)
  assert.match(request, /Предварительная сумма с доставкой: 510 ₽/)
  assert.match(request, /634000, Томск/)
  assert.match(request, /оплата пока не указана/)
  assert.doesNotMatch(request, /демо|архив|истёкш/i)
})

test('shipping follows the current catalog, including two separate shipments and the printed catalog', () => {
  const seeds = { ...plants[0], category: 'annuals', price: 60 }
  const planting = { ...plants[0], catalogNumber: 170, category: 'planting', price: 200 }
  const booklet = { ...plants[0], catalogNumber: 212, category: 'catalog', price: 60 }
  const lines = [{ plant: seeds, quantity: 1 }, { plant: planting, quantity: 2 }]
  const post = getOrderEstimate(lines, { name: '', contact: '', comment: '', delivery: 'post' })
  assert.equal(post.shippingTotal, 940)
  assert.equal(post.shipments, 2)
  assert.equal(post.total, 1400)
  assert.equal(post.minimumAdvance, 1078)
  for (const delivery of ['ozon', 'yandex', '5post']) {
    const estimate = getOrderEstimate(lines, { name: '', contact: '', comment: '', delivery })
    assert.equal(estimate.shippingTotal, 620)
    assert.equal(estimate.minimumAdvance, estimate.total)
  }
  assert.equal(getOrderEstimate([{ plant: booklet, quantity: 1 }], { name: '', contact: '', comment: '' }).shippingTotal, 0)
  assert.equal(getOrderEstimate([...lines, { plant: booklet, quantity: 1 }], { name: '', contact: '', comment: '' }).shippingTotal, 940)
})

test('10 percent discount starts strictly above 8000 rubles or with a returning customer code', () => {
  const fields = { name: '', contact: '', comment: '' }
  const makeLines = price => [{ plant: { ...plants[0], price }, quantity: 1 }]
  assert.equal(getOrderEstimate(makeLines(8000), fields).discount, 0)
  assert.equal(getOrderEstimate(makeLines(8010), fields).discount, 801)
  assert.equal(getOrderEstimate(makeLines(500), { ...fields, customerCode: '12345' }).discount, 50)
  assert.equal(getOrderEstimate(makeLines(500), { ...fields, customerCode: '   ' }).discount, 0)
})

test('unpriced positions stay explicit in the request', () => {
  const request = buildRequestText([{ plant: { ...plants[0], price: null }, quantity: 2 }], { name: '', contact: '', comment: '' })
  assert.match(request, /цена уточняется/)
  assert.match(request, /Позиций без опубликованной цены: 1 \(не включены в сумму\)/)
})

for (const mode of ['modern', 'fallback', 'denied', 'throws']) {
  test(`clipboard ${mode}: success is reported only after a successful copy`, async t => {
    const saved = Object.fromEntries(['navigator', 'document', 'HTMLElement'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    t.after(() => {
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    })
    let copied = ''
    let appended = false
    let removed = false
    let restored = false
    let selected = false
    class Element { focus() { restored = true } }
    const textarea = { value: '', style: {}, focus() {}, select() { selected = true }, remove() { removed = true } }
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: Element })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { async writeText(text) {
      if (mode !== 'modern') throw new Error('Clipboard denied')
      copied = text
    } } } })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      activeElement: new Element(),
      createElement: () => textarea,
      execCommand(command) {
        assert.equal(command, 'copy')
        assert.ok(appended && selected, 'fallback is selected inside the supplied active dialog')
        if (mode === 'throws') throw new Error('Copy unavailable')
        if (mode === 'denied') return false
        copied = textarea.value
        return true
      },
    } })
    const result = await copyText('Проверочная заявка', { append() { appended = true } })
    assert.equal(result, mode === 'modern' || mode === 'fallback')
    assert.equal(copied, result ? 'Проверочная заявка' : '')
    if (mode !== 'modern') assert.ok(removed && restored, 'fallback cleans up and restores focus even on failure')
  })
}
