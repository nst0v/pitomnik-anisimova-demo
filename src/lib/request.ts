import type { Plant } from '../data/plants'

export type Cart = Record<string, number>
export type DeliveryMethod = 'post' | 'ozon' | 'yandex' | '5post'

export type RequestFields = {
  name: string
  contact: string
  comment: string
  address?: string
  customerCode?: string
  delivery?: DeliveryMethod
  payment?: string
}

export type CartLine = {
  plant: Plant
  quantity: number
}

export const deliveryLabels: Record<DeliveryMethod, string> = {
  post: 'Почта России',
  ozon: 'OZON',
  yandex: 'Яндекс Доставка',
  '5post': 'Пятёрочка (5 Post)',
}

export const formatRubles = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value) + ' ₽'

export function getUnitPrice(plant: Plant, quantity: number): number | null {
  if (plant.price === null) return null
  const tier = plant.priceTiers
    ?.filter((item) => quantity >= item.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0]
  return tier?.price ?? plant.price
}

export function getCartLines(cart: Cart, allPlants: Plant[]): CartLine[] {
  return allPlants
    .filter((plant) => Number.isFinite(cart[String(plant.catalogNumber)]) && (cart[String(plant.catalogNumber)] ?? 0) > 0)
    .map((plant) => ({ plant, quantity: cart[String(plant.catalogNumber)] }))
}

export function getCartSummary(lines: CartLine[]) {
  const knownTotal = lines.reduce((sum, line) => sum + (getUnitPrice(line.plant, line.quantity) ?? 0) * line.quantity, 0)
  const unknownPriceCount = lines.filter((line) => line.plant.price === null).length
  const unitsCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  return { knownTotal, unknownPriceCount, unitsCount }
}

export function getOrderEstimate(lines: CartLine[], fields: RequestFields) {
  const { knownTotal, unknownPriceCount } = getCartSummary(lines)
  const delivery = fields.delivery && fields.delivery in deliveryLabels ? fields.delivery : 'post'
  const hasSeeds = lines.some(({ plant }) => plant.category !== 'planting' && plant.category !== 'catalog' && !plant.shippingIncluded)
  const hasPlanting = lines.some(({ plant }) => plant.category === 'planting' && !plant.shippingIncluded)
  const shippingTotal = (hasSeeds ? delivery === 'post' ? 390 : 230 : 0) + (hasPlanting ? delivery === 'post' ? 550 : 390 : 0)
  const discountEligible = Boolean(fields.customerCode?.trim()) || knownTotal > 8000
  const discount = discountEligible ? Math.round(knownTotal * 10) / 100 : 0
  const merchandiseTotal = Math.round((knownTotal - discount) * 100) / 100
  const total = Math.round((merchandiseTotal + shippingTotal) * 100) / 100
  const shipments = Number(hasSeeds) + Number(hasPlanting)
  const minimumAdvance = delivery === 'post' ? Math.ceil((shippingTotal + merchandiseTotal * 0.3) * 100) / 100 : total

  return { delivery, shippingTotal, discount, merchandiseTotal, total, shipments, minimumAdvance, unknownPriceCount }
}

export function buildRequestText(lines: CartLine[], fields: RequestFields) {
  const { knownTotal } = getCartSummary(lines)
  const estimate = getOrderEstimate(lines, fields)
  const itemLines = lines.length
    ? lines.map((line) => {
        const unitPrice = getUnitPrice(line.plant, line.quantity)
        const price = unitPrice === null ? 'цена уточняется' : `${formatRubles(unitPrice)} за единицу; ${formatRubles(unitPrice * line.quantity)}`
        return `№ ${line.plant.catalogNumber} — ${line.plant.name} — ${line.quantity} × ${line.plant.unit} (${price})`
      })
    : ['Позиции пока не выбраны.']

  return [
    'Заказ — питомник Анисимова',
    'Каталог сезона 2026–2027. Действует до 15 октября 2027 года.',
    '',
    `Номера по каталогу: ${lines.map(({ plant, quantity }) => quantity === 1 ? String(plant.catalogNumber) : `${plant.catalogNumber}-${quantity}`).join(', ') || 'не выбраны'}`,
    '',
    ...itemLines,
    '',
    `Стоимость растений без доставки: ${formatRubles(knownTotal)}`,
    ...(estimate.unknownPriceCount ? [`Позиций без опубликованной цены: ${estimate.unknownPriceCount} (не включены в сумму).`] : []),
    ...(estimate.discount ? [`Скидка 10%${fields.customerCode?.trim() ? ' по коду постоянного заказчика (подтверждается питомником)' : ' на заказ свыше 8 000 ₽'}: ${formatRubles(estimate.discount)}`] : []),
    `Доставка: ${deliveryLabels[estimate.delivery]}`,
    ...(estimate.shipments ? [`Пересылка по России (${estimate.shipments} отпр.): ${formatRubles(estimate.shippingTotal)}`] : ['Пересылка печатного каталога: в конверте питомника.']),
    `Предварительная сумма с доставкой: ${formatRubles(estimate.total)}`,
    '',
    `Ф.И.О.: ${fields.name.trim() || 'не указаны'}`,
    `Телефон или электронная почта: ${fields.contact.trim() || 'не указаны'}`,
    `Адрес с индексом / адрес пункта выдачи: ${fields.address?.trim() || 'не указан'}`,
    `Код постоянного заказчика: ${fields.customerCode?.trim() || 'первый заказ / не указан'}`,
    `Сумма и дата перевода / сведения об оплате: ${fields.payment?.trim() || 'оплата пока не указана'}`,
    `Комментарий: ${fields.comment.trim() || 'нет'}`,
    '',
    'Прошу подтвердить наличие и итоговую сумму заказа. Для доставки за пределы России прошу рассчитать пересылку отдельно.',
    estimate.delivery === 'post'
      ? 'Условия оплаты: полная предоплата либо пересылка + не менее 30% стоимости товара. Остаток — наложенным платежом; почтовые расходы в этом случае могут быть выше.'
      : 'Условия оплаты выбранной доставки: полная предоплата.',
    'Семена отправляются в течение 3–5 дней после получения аванса. Саженцы, корни и луковицы — в сроки, указанные в каталоге, отдельным отправлением.',
  ].join('\n')
}
