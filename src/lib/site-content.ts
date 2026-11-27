import { plants, type Plant } from '../data/plants'
import { articles, articleCategories, featuredArticles, type Article, type ArticleSummary } from '../data/articles'

export type ManagedPlant = Plant & { hidden?: boolean }
export type ManagedArticle = ArticleSummary & { blocks?: Article['blocks']; hidden?: boolean }
export type SiteContent = {
  products: ManagedPlant[]
  articles: Article[]
  hiddenArticles: string[]
}

const originalPlants = structuredClone(plants)
const originalArticles = structuredClone(articles)
const originalArticleSlugs = new Set(originalArticles.map((article) => article.slug))
let content: SiteContent = { products: [], articles: [], hiddenArticles: [] }

export function getSiteContent(): SiteContent {
  return structuredClone(content)
}

export function allManagedPlants(): ManagedPlant[] {
  const merged = new Map<number, ManagedPlant>(originalPlants.map((plant) => [plant.catalogNumber, plant]))
  for (const plant of content.products) {
    merged.set(plant.catalogNumber, { ...merged.get(plant.catalogNumber), ...plant })
  }
  return [...merged.values()].sort((a, b) => a.catalogNumber - b.catalogNumber)
}

export function allManagedArticles(): ManagedArticle[] {
  const merged = new Map<string, ManagedArticle>(originalArticles.map((article) => [article.slug, article]))
  for (const article of content.articles) merged.set(article.slug, { ...merged.get(article.slug), ...article })
  const ordered = [
    ...content.articles.filter((article) => !originalArticleSlugs.has(article.slug)).reverse(),
    ...originalArticles.map((article) => merged.get(article.slug)!),
  ]
  return ordered.map((article) => ({ ...article, hidden: content.hiddenArticles.includes(article.slug) }))
}

export function applySiteContent(next: SiteContent) {
  if (!next || !Array.isArray(next.products) || !Array.isArray(next.articles) || !Array.isArray(next.hiddenArticles)) {
    throw new Error('Некорректный ответ сервера')
  }
  content = structuredClone(next)
  plants.splice(0, plants.length, ...allManagedPlants().filter((plant) => !plant.hidden))
  articles.splice(0, articles.length, ...allManagedArticles().filter((article) => !article.hidden))
  featuredArticles.splice(0, featuredArticles.length, ...articles.filter((article) => article.featured))
  articleCategories.splice(0, articleCategories.length, ...new Set(articles.map((article) => article.category)))
}

export async function loadSiteContent() {
  try {
    const response = await fetch(new URL('site-content.json', document.baseURI), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (response.ok) applySiteContent(await response.json() as SiteContent)
  } catch {
    // The original catalog remains available during a connection failure.
  }
}
