import articleIndex from './article-index.json'
import { plants, type PlantImage } from './plants'

export type ArticleBlock = {
  type: 'paragraph' | 'heading' | 'image' | 'list'
  text?: string
  src?: string
  alt?: string
  caption?: string
  items?: string[]
}

export type ArticleSummary = {
  slug: string
  title: string
  excerpt: string
  category: string
  origin: 'new' | 'archive'
  author: string
  plantNumbers: number[]
  readingMinutes: number
  contentUrl: string
  contentStatus: 'full' | 'excerpt'
  sourceUrl?: string
  sourceFile?: string
  downloadUrl?: string
  originalDocumentUrl?: string
  featured?: boolean
  coverImage?: PlantImage
}

export type Article = ArticleSummary & { blocks: ArticleBlock[] }

export const articles = articleIndex as ArticleSummary[]
export const featuredArticles = articles.filter((article) => article.featured)
export const articleCategories = [...new Set(articles.map((article) => article.category))]

export function articleCover(article: ArticleSummary): PlantImage | undefined {
  return article.coverImage ?? article.plantNumbers.map((number) => plants.find((plant) => plant.catalogNumber === number)?.image).find(Boolean)
}

export function articleHref(article: ArticleSummary) {
  return `#/articles/${encodeURIComponent(article.slug)}`
}
