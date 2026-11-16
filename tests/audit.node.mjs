import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeSearch } from '../src/lib/search.ts'
import { copyText } from '../src/lib/clipboard.ts'
import { buildRequestText } from '../src/lib/request.ts'
import { plants } from '../src/data/plants.ts'

test('unaccented Latin query finds the actual Bergenia catalog entry', () => {
  const matches = plants.filter(p => normalizeSearch(`${p.catalogNumber} ${p.name} ${p.latinName ?? ''}`).includes(normalizeSearch('Bergenia crassifolia')))
  assert.deepEqual(matches.map(p => p.catalogNumber), [176])
  assert.equal(normalizeSearch('  № 42  '), '42')
  assert.equal(normalizeSearch('Ёлка'), 'елка')
  assert.notEqual(normalizeSearch('й'), normalizeSearch('и'))
})

test('request retains original numbers, quantities, units and archive warning', () => {
  const flower = plants.find(p => p.catalogNumber === 42)
  const seedling = plants.find(p => p.catalogNumber === 176)
  const request = buildRequestText([{ plant: flower, quantity: 2 }, { plant: seedling, quantity: 1 }], { name: 'Тест', contact: 'qa@example.com', comment: '' })
  assert.match(request, /Номера по каталогу: 42-2, 176/)
  assert.match(request, /2 × Пакет, 50 семян/)
  assert.match(request, /1 × 1 саженец/)
  assert.match(request, /архивным ценам без доставки: 550 ₽/)
  assert.match(request, /истёкшего каталога 2025–2026/)
  assert.match(request, /не оплаченный заказ/)
})

test('unpriced positions stay explicit in the request', () => {
  const request = buildRequestText([{ plant: { ...plants[0], price: null }, quantity: 2 }], { name: '', contact: '', comment: '' })
  assert.match(request, /цена не опубликована/)
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
