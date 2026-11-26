import catalogData from './catalog-2027.json'
import { plantImages } from './plant-images'

export type CategoryId = 'annuals' | 'perennials' | 'useful' | 'planting' | 'catalog'

export type PlantImage = {
  src: string
  alt: string
  sourceUrl: string
  attribution?: {
    author: string
    license: string
    licenseUrl: string
  }
}

export type Plant = {
  catalogNumber: number
  name: string
  latinName?: string
  category: CategoryId
  description: string
  unit: string
  /** Catalogue price per packet or per single physical planting unit. */
  price: number | null
  sourceUrl: string
  image?: PlantImage
  note?: string
  priceNote?: string
  shippingNote?: string
  /** Planting material is sold in physical units, subject to this minimum. */
  minimumQuantity?: number
  quantityStep?: number
  priceTiers?: Array<{ minQuantity: number; price: number }>
  shippingIncluded?: boolean
}

export const categories: Array<{ id: CategoryId; label: string; shortLabel: string }> = [
  { id: 'annuals', label: 'Цветы — однолетники', shortLabel: 'Однолетники' },
  { id: 'perennials', label: 'Многолетники и декоративные', shortLabel: 'Многолетники' },
  { id: 'useful', label: 'Лекарственные, пряные и овощные', shortLabel: 'Полезные растения' },
  { id: 'planting', label: 'Саженцы, луковицы и клубни', shortLabel: 'Саженцы и луковицы' },
  { id: 'catalog', label: 'Печатный каталог', shortLabel: 'Печатный каталог' },
]

export const catalogSeason = {
  label: '2026–2027',
  year: 2027,
  validUntil: '2027-10-15',
  validUntilLabel: '15 октября 2027 года',
  downloadUrl: './catalog-2027.docx',
} as const

// The current Word catalogue is the source of product numbers, prices, packet
// sizes and quantity rules. Photos are maintained independently by number.
export const plants: Plant[] = (catalogData as Plant[]).map((plant) => ({
  ...plant,
  image: plantImages[plant.catalogNumber],
}))

export const categoryById = Object.fromEntries(categories.map((category) => [category.id, category])) as Record<CategoryId, (typeof categories)[number]>

export const NURSERY_EMAIL = 'sem-ot-anis@mail.ru'
