import { articleCover, articleHref, type ArticleSummary } from '../data/articles'

export default function ArticleCard({ article, featured = false }: { article: ArticleSummary; featured?: boolean }) {
  const cover = articleCover(article)
  return (
    <article className={`article-card${featured ? ' article-card-featured' : ''}`}>
      <a className="article-card-photo" href={articleHref(article)} tabIndex={-1} aria-hidden="true">
        {cover ? <img src={cover.src} alt="" loading="lazy" decoding="async" /> : <span className="article-book-mark" aria-hidden="true">А</span>}
        <span className={`article-origin ${article.origin === 'new' ? 'article-origin-new' : ''}`}>{article.origin === 'new' ? 'Новое на сайте' : 'Из архива'}</span>
      </a>
      <div className="article-card-body">
        <p className="article-card-meta">{article.category} <span>·</span> {article.readingMinutes} мин чтения</p>
        <h3><a href={articleHref(article)}>{article.title}</a></h3>
        <p className="article-card-excerpt">{article.excerpt}</p>
        <a className="article-read-link" href={articleHref(article)} aria-label={`Читать статью «${article.title}»`}>Читать статью <span aria-hidden="true">↗</span></a>
      </div>
    </article>
  )
}
