import { useEffect, useMemo, useState } from 'react'
import { articles, articleCategories, articleCover, type Article } from '../data/articles'
import { plants } from '../data/plants'
import { normalizeSearch } from '../lib/search'
import ArticleCard from './ArticleCard'

type ArticlesProps = { slug: string | null; onSelectPlant: (number: number) => void }

function CoverCredit({ article }: { article: Article }) {
  const cover = articleCover(article)
  if (!cover) return null
  if (!cover.attribution) return <figcaption>Фото из коллекции питомника Анисимова</figcaption>
  return <figcaption>Иллюстрация вида · <a href={cover.sourceUrl} target="_blank" rel="noreferrer">Фото: {cover.attribution.author}</a> · <a href={cover.attribution.licenseUrl} target="_blank" rel="noreferrer">{cover.attribution.license}</a></figcaption>
}

function ArticleReader({ slug, onSelectPlant }: { slug: string; onSelectPlant: ArticlesProps['onSelectPlant'] }) {
  const summary = articles.find((article) => article.slug === slug)
  const [loaded, setLoaded] = useState<Article | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setLoaded(null)
    setError(false)
    if (!summary) return
    const controller = new AbortController()
    fetch(summary.contentUrl, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Article is unavailable'); return response.json() as Promise<Article> })
      .then((article) => { if (article.slug !== summary.slug || !Array.isArray(article.blocks)) throw new Error('Invalid article'); setLoaded(article) })
      .catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true) })
    return () => controller.abort()
  }, [summary, attempt])

  useEffect(() => {
    if (summary) document.title = `${summary.title} — статьи питомника Анисимова`
  }, [summary])

  if (!summary) return <section className="article-state container"><p className="section-kicker">Статьи питомника</p><h1>Статья не найдена</h1><p>Возможно, ссылка изменилась. Выберите материал в списке статей.</p><a className="button button-primary" href="#/articles">Все статьи</a></section>
  if (error) return <section className="article-state container"><h1>Не удалось открыть статью</h1><p>Проверьте подключение к интернету и попробуйте ещё раз.</p><button className="button button-primary" type="button" onClick={() => setAttempt((value) => value + 1)}>Попробовать ещё раз</button><a className="source-link" href="#/articles">К списку статей</a></section>
  if (!loaded) return <section className="article-state container" aria-live="polite"><p className="section-kicker">Читаем вместе</p><h1>{summary.title}</h1><p>Открываем статью…</p></section>

  const cover = articleCover(loaded)
  const relatedPlants = loaded.plantNumbers.flatMap((number) => plants.find((plant) => plant.catalogNumber === number) ?? []).slice(0, 4)
  const relatedArticles = articles.filter((article) => article.slug !== slug && article.plantNumbers.some((number) => loaded.plantNumbers.includes(number))).slice(0, 3)
  return (
    <>
      <article className="article-reader">
        <header className="article-reader-header container">
          <a className="article-back" href="#/articles"><span aria-hidden="true">←</span> Все статьи</a>
          <div className="article-reader-labels"><span className="article-origin">{loaded.origin === 'new' ? 'Новое на сайте' : 'Из авторского архива'}</span><span>{loaded.category}</span><span>{loaded.readingMinutes} мин чтения</span></div>
          <h1>{loaded.title}</h1>
          <p className="article-reader-lead">{loaded.excerpt}</p>
          <div className="article-author"><img src="./images/gennady-anisimov.gif" alt="" /><div><strong>{loaded.author}</strong><span>Садовод, коллекционер редких растений · Томск</span></div></div>
        </header>
        {cover && <figure className="article-reader-cover container"><img src={cover.src} alt={cover.alt} fetchPriority="high" /><CoverCredit article={loaded} /></figure>}
        <div className="article-reader-layout container">
          <div className="article-prose">
            {loaded.contentStatus === 'excerpt' && <p className="article-text-note">В архиве сохранилось вступление к статье. Полный авторский материал доступен по ссылке на оригинал ниже.</p>}
            {loaded.blocks.map((block, index) => {
              if (block.type === 'heading') return <h2 key={index}>{block.text}</h2>
              if (block.type === 'list') return <ul key={index}>{(block.items ?? []).map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
              if (block.type === 'image') return <figure key={index}><img src={block.src} alt={block.alt || loaded.title} loading="lazy" />{(block.caption || block.text) && <figcaption>{block.caption || block.text}</figcaption>}</figure>
              return <p key={index}>{block.text}</p>
            })}
            <footer className="article-attribution"><strong>{loaded.author}</strong><span>Авторские наблюдения и опыт выращивания растений.</span>{loaded.sourceUrl && <a href={loaded.sourceUrl} target="_blank" rel="noreferrer">Публикация на сайте автора ↗</a>}</footer>
          </div>
          <aside className="article-sidebar" aria-label="Материалы к статье">
            {(loaded.downloadUrl || loaded.originalDocumentUrl) && <div className="article-sidebar-box article-original"><p className="section-kicker">Авторский оригинал</p><h2>Сохранить для чтения</h2><p>Оригинальная статья в Word — для вашей садовой библиотеки.</p><a className="button button-outline" href={loaded.downloadUrl || loaded.originalDocumentUrl} download={Boolean(loaded.downloadUrl)} target={loaded.downloadUrl ? undefined : '_blank'} rel="noreferrer">Скачать статью в Word <span aria-hidden="true">↓</span></a></div>}
            {relatedPlants.length > 0 && <div className="article-sidebar-box"><p className="section-kicker">Из нашей коллекции</p><h2>Растения из статьи</h2><div className="article-related-plants">{relatedPlants.map((plant) => <a href="#catalog" key={plant.catalogNumber} onClick={() => onSelectPlant(plant.catalogNumber)}>{plant.image && <img src={plant.image.src} alt="" loading="lazy" />}<span><small>№ {plant.catalogNumber} · каталог 2026–2027</small><strong>{plant.name}</strong><em>Посмотреть в каталоге ↗</em></span></a>)}</div></div>}
            <div className="article-sidebar-author"><span>Из Томска — в ваш сад</span><p>Редкие растения интереснее выращивать, когда знаешь их историю.</p><a href="#about">Познакомиться с питомником ↗</a></div>
          </aside>
        </div>
      </article>
      {relatedArticles.length > 0 && <section className="article-related-section section"><div className="container"><p className="section-kicker">Продолжим знакомство</p><h2>Ещё об этих растениях</h2><div className="articles-list-grid">{relatedArticles.map((article) => <ArticleCard key={article.slug} article={article} />)}</div></div></section>}
      <div className="article-reader-end container"><a className="button button-outline" href="#/articles">← Вернуться к статьям</a><a className="text-link" href="#catalog">Открыть каталог растений ↗</a></div>
    </>
  )
}

export default function Articles({ slug, onSelectPlant }: ArticlesProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [visible, setVisible] = useState(12)
  const filtered = useMemo(() => {
    const search = normalizeSearch(query)
    return articles.filter((article) => (filter === 'all' || article.category === filter) && (!search || normalizeSearch(`${article.title} ${article.excerpt} ${article.category}`).includes(search)))
  }, [query, filter])
  useEffect(() => { setVisible(12) }, [query, filter])
  useEffect(() => { if (!slug) document.title = 'Статьи о редких растениях — питомник Анисимова' }, [slug])

  if (slug) return <ArticleReader key={slug} slug={slug} onSelectPlant={onSelectPlant} />

  return (
    <>
      <section className="articles-page-hero"><div className="container articles-page-intro"><div><a className="article-back" href="#top">← Главная</a><p className="section-kicker">Библиотека садовода</p><h1>У каждого растения<br />есть своя <em>история.</em></h1><p>Статьи Геннадия Павловича Анисимова о редких растениях, которые он выращивает в своём питомнике. Личный опыт, наблюдения и советы садоводам.</p></div><div className="articles-editor-note"><span className="article-book-mark" aria-hidden="true">А</span><strong>Из собственного сада</strong><p>Личный опыт выращивания редких растений. Все статьи можно прочитать здесь и сохранить в Word.</p><div><span><b>{articles.length}</b> статей</span><span><b>1</b> авторская коллекция</span></div></div></div></section>
      <section className="articles-library section"><div className="container">
        <div className="articles-library-toolbar"><div className="article-filters" role="group" aria-label="Фильтр статей">{([{ value: 'all', label: 'Все статьи', count: articles.length }, ...articleCategories.map((category) => ({ value: category, label: category, count: articles.filter((article) => article.category === category).length }))]).map((item) => <button type="button" key={item.value} onClick={() => setFilter(item.value)} aria-pressed={filter === item.value} className={filter === item.value ? 'active' : ''}>{item.label} <span>{item.count}</span></button>)}</div><label className="article-search"><span className="sr-only">Поиск по статьям</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="m15 15 5 5" /></svg><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название растения или тема" /></label></div>
        <div className="article-results"><p aria-live="polite">Найдено: <strong>{filtered.length}</strong></p>{(query || filter !== 'all') && <button type="button" onClick={() => { setQuery(''); setFilter('all') }}>Сбросить фильтры</button>}</div>
        {filtered.length ? <div className="articles-list-grid">{filtered.slice(0, visible).map((article) => <ArticleCard key={article.slug} article={article} />)}</div> : <div className="article-state article-empty"><h2>Статьи не найдены</h2><p>Попробуйте другое название растения или выберите все статьи.</p><button className="button button-primary" type="button" onClick={() => { setQuery(''); setFilter('all') }}>Показать все статьи</button></div>}
        {filtered.length > visible && <div className="catalog-load-more"><p>Показано {visible} из {filtered.length}</p><button className="button button-outline" type="button" onClick={() => setVisible((count) => count + 12)}>Показать ещё статьи <span aria-hidden="true">+</span></button></div>}
        <div className="article-archive-note"><strong>Авторский архив</strong><p>Статьи основаны на личном опыте Геннадия Павловича. При использовании материалов сохраняйте имя автора и ссылку на его сайт.</p><a href="https://sem-ot-anis.narod.ru/publ/" target="_blank" rel="noreferrer">Раздел статей на старом сайте ↗</a></div>
      </div></section>
    </>
  )
}
