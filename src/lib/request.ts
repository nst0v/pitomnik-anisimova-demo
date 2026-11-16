import type { Plant } from '../data/plants'

export type Cart = Record<string, number>

export type RequestFields = {
  name: string
  contact: string
  comment: string
}

export type CartLine = {
  plant: Plant
  quantity: number
}

export const formatRubles = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₽'

export function getCartLines(cart: Cart, allPlants: Plant[]): CartLine[] {
  return allPlants
    .filter((plant) => (cart[String(plant.catalogNumber)] ?? 0) > 0)
    .map((plant) => ({ plant, quantity: cart[String(plant.catalogNumber)] }))
}

export function getCartSummary(lines: CartLine[]) {
  const knownTotal = lines.reduce((sum, line) => {
    if (line.plant.price === null) return sum
    return sum + line.plant.price * line.quantity
  }, 0)
  const unknownPriceCount = lines.filter((line) => line.plant.price === null).length
  const unitsCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  return { knownTotal, unknownPriceCount, unitsCount }
}

export function buildRequestText(lines: CartLine[], fields: RequestFields) {
  const { knownTotal, unknownPriceCount } = getCartSummary(lines)
  const itemLines = lines.length
    ? lines.map((line) => {
        const price = line.plant.price === null ? 'цена не опубликована' : formatRubles(line.plant.price * line.quantity)
        return `№ ${line.plant.catalogNumber} — ${line.plant.name} — ${line.quantity} шт. (${price})`
      })
    : ['Позиции пока не выбраны.']

  const unknownLine = unknownPriceCount
    ? `\nПозиций без опубликованной цены: ${unknownPriceCount} (не включены в сумму).`
    : ''

  return [
    'Предварительная заявка — питомник Анисимова',
    '',
    ...itemLines,
    '',
    `Стоимость выбранных позиций без доставки: ${formatRubles(knownTotal)}${unknownLine}`,
    '',
    `Имя: ${fields.name.trim() || 'не указано'}`,
    `Контакт для ответа: ${fields.contact.trim() || 'не указан'}`,
    `Комментарий: ${fields.comment.trim() || 'нет'}`,
    '',
    'Прошу подтвердить наличие, актуальные цены, сроки и стоимость доставки до оплаты.',
  ].join('\n')
}
