import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Article, ArticleBlock } from '../data/articles'
import { categories, catalogSeason } from '../data/plants'
import { allManagedArticles, allManagedPlants, applySiteContent, getSiteContent, type ManagedArticle, type ManagedPlant, type SiteContent } from '../lib/site-content'
import { normalizeSearch } from '../lib/search'
import '../admin.css'

type Session = { authenticated: boolean; csrfToken?: string }
type AdminResponse = Session & { error?: string }

const unavailableMessage = 'Вход временно недоступен. Не удалось подключиться к серверу входа. Попробуйте позже.'

async function adminRequest(action: string, options: RequestInit = {}): Promise<AdminResponse> {
  let response: Response
  try {
    response = await fetch(new URL(`api/admin/${action}`, document.baseURI), {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(unavailableMessage)
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(unavailableMessage)
  let data: AdminResponse
  try { data = await response.json() as AdminResponse } catch { throw new Error(unavailableMessage) }
  if (!response.ok) {
    if (action === 'logout' && response.status === 401) return { authenticated: false }
    throw new Error(data.error || 'Не удалось выполнить запрос. Попробуйте ещё раз.')
  }
  if (typeof data.authenticated !== 'boolean' || (data.authenticated && !data.csrfToken)) throw new Error(unavailableMessage)
  return data
}

function LeafMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 4C9 2 3 7 5 14s12 6 14-2c.6-2.3.7-5.1 1-8Z" /><path d="m4 21 11-12M8 17v-5m3 2h5" /></svg>
}

function LockMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></svg>
}

type ProductEditor = ManagedPlant & { price: number | null }
type ArticleEditor = { article: ManagedArticle; text: string; hidden: boolean; originalBlocks: ArticleBlock[] }

function articleText(blocks: ArticleBlock[]) {
  return blocks.filter((block) => block.type !== 'image').map((block) => block.type === 'list' ? (block.items ?? []).join('\n') : block.text ?? '').filter(Boolean).join('\n\n')
}

function editedArticleBlocks(text: string, originalBlocks: ArticleBlock[]): ArticleBlock[] {
  if (text === articleText(originalBlocks)) return originalBlocks
  const next: ArticleBlock[] = text.trim().split(/\n\s*\n/).map((paragraph) => ({ type: 'paragraph', text: paragraph.trim() }))
  let precedingTextBlocks = 0
  let imagesAdded = 0
  for (const block of originalBlocks) {
    if (block.type === 'image') {
      next.splice(Math.min(precedingTextBlocks + imagesAdded, next.length), 0, block)
      imagesAdded++
    } else precedingTextBlocks++
  }
  return next
}

function AdminManager({ csrfToken, onSessionExpired }: { csrfToken: string; onSessionExpired: () => void }) {
  const [section, setSection] = useState<'products' | 'articles'>('products')
  const [products, setProducts] = useState(allManagedPlants)
  const [materials, setMaterials] = useState(allManagedArticles)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(20)
  const [productEditor, setProductEditor] = useState<ProductEditor | null>(null)
  const [articleEditor, setArticleEditor] = useState<ArticleEditor | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingArticle, setLoadingArticle] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const editorRef = useRef<HTMLElement>(null)

  function refresh(content: SiteContent) {
    applySiteContent(content)
    setProducts(allManagedPlants())
    setMaterials(allManagedArticles())
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch(new URL('site-content.json', document.baseURI), { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Не удалось загрузить последние изменения. Обновите страницу.')
      const content = await response.json() as SiteContent
      if (!controller.signal.aborted) refresh(content)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить изменения.')
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (productEditor || articleEditor) {
      editorRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
      editorRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    }
  }, [Boolean(productEditor), Boolean(articleEditor)])

  async function saveContent(action: string, value: unknown): Promise<SiteContent> {
    let response: Response
    try {
      response = await fetch(new URL(`api/admin/${action}`, document.baseURI), {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(value),
      })
    } catch { throw new Error('Не удалось сохранить изменения. Проверьте подключение и попробуйте ещё раз.') }
    if (response.status === 401) {
      onSessionExpired()
      throw new Error('Сеанс завершён. Войдите ещё раз.')
    }
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Не удалось сохранить изменения. Проверьте подключение и попробуйте ещё раз.')
    const data = await response.json() as { content?: SiteContent; error?: string }
    if (!response.ok || !data.content) throw new Error(data.error || 'Не удалось сохранить изменения.')
    refresh(data.content)
    return data.content
  }

  function closeEditor() {
    setProductEditor(null)
    setArticleEditor(null)
    setError('')
  }

  function changeSection(value: 'products' | 'articles') {
    closeEditor()
    setSection(value)
    setSearch('')
    setLimit(20)
    setMessage('')
  }

  function newProduct() {
    setError(''); setMessage('')
    setProductEditor({ catalogNumber: Math.max(0, ...products.map((product) => product.catalogNumber)) + 1, name: '', description: '', price: null, category: 'annuals', unit: 'Пакет семян', sourceUrl: '', minimumQuantity: 1 })
  }

  function newArticle() {
    setError(''); setMessage('')
    const slug = `article-${Date.now()}`
    setArticleEditor({ article: { slug, title: '', excerpt: '', category: 'Советы садоводу', author: 'Геннадий Павлович Анисимов', origin: 'new', plantNumbers: [], readingMinutes: 1, contentStatus: 'full', contentUrl: `./api/content/articles/${slug}` }, text: '', hidden: false, originalBlocks: [] })
  }

  async function editArticle(article: ManagedArticle) {
    setLoadingArticle(true); setError(''); setMessage('')
    try {
      let blocks = getSiteContent().articles.find((item) => item.slug === article.slug)?.blocks
      if (!blocks) {
        const response = await fetch(new URL(article.contentUrl, document.baseURI), { cache: 'no-store' })
        if (!response.ok) throw new Error('Не удалось открыть текст статьи. Попробуйте ещё раз.')
        blocks = (await response.json() as Article).blocks
      }
      if (!Array.isArray(blocks)) throw new Error('Не удалось открыть текст статьи.')
      setArticleEditor({ article: { ...article }, text: articleText(blocks), hidden: Boolean(article.hidden), originalBlocks: blocks })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть статью.')
    } finally { setLoadingArticle(false) }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!productEditor || saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      await saveContent('products', { ...productEditor, name: productEditor.name.trim(), description: productEditor.description.trim() })
      closeEditor()
      setMessage('Товар сохранён. Изменения уже видны на сайте.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить товар.') } finally { setSaving(false) }
  }

  async function saveArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!articleEditor || saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      const { article, text, originalBlocks } = articleEditor
      const blocks = editedArticleBlocks(text, originalBlocks)
      const body: Article & { hidden: boolean } = { ...article, title: article.title.trim(), excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 200), blocks, contentStatus: 'full', readingMinutes: Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200)), contentUrl: `./api/content/articles/${article.slug}`, hidden: articleEditor.hidden }
      await saveContent('articles', body)
      closeEditor()
      setMessage('Статья сохранена. Изменения уже видны на сайте.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить статью.') } finally { setSaving(false) }
  }

  const query = normalizeSearch(search)
  const filteredProducts = products.filter((product) => normalizeSearch(`${product.catalogNumber} ${product.name}`).includes(query))
  const filteredArticles = materials.filter((article) => normalizeSearch(article.title).includes(query))

  return <>
    <div className="admin-tabs" role="group" aria-label="Раздел кабинета">
      <button type="button" className={section === 'products' ? 'active' : ''} aria-pressed={section === 'products'} onClick={() => changeSection('products')} disabled={saving || Boolean(productEditor) || Boolean(articleEditor)}><span aria-hidden="true">❀</span> Товары</button>
      <button type="button" className={section === 'articles' ? 'active' : ''} aria-pressed={section === 'articles'} onClick={() => changeSection('articles')} disabled={saving || Boolean(productEditor) || Boolean(articleEditor)}><span aria-hidden="true">▤</span> Статьи</button>
    </div>
    {message && <p className="admin-success" role="status">✓ {message}</p>}
    {productEditor ? <section className="admin-editor" ref={editorRef} aria-labelledby="admin-editor-title">
      <h2 id="admin-editor-title">{products.some((product) => product.catalogNumber === productEditor.catalogNumber) ? 'Изменить товар' : 'Добавить товар'}</h2>
      <form onSubmit={saveProduct} aria-busy={saving}>
        <fieldset disabled={saving}>
          <label>Название товара<input value={productEditor.name} onChange={(event) => setProductEditor({ ...productEditor, name: event.target.value })} required maxLength={300} /></label>
          <div className="admin-form-row"><label>Цена, ₽<input aria-label="Цена, ₽" aria-describedby="admin-price-hint" type="number" min="0.01" step="0.01" value={productEditor.price ?? ''} onChange={(event) => setProductEditor({ ...productEditor, price: event.target.value === '' ? null : Number(event.target.value) })} /><small id="admin-price-hint">Без цены на сайте будет «По запросу».</small></label><label>За что указана цена<input value={productEditor.unit} onChange={(event) => setProductEditor({ ...productEditor, unit: event.target.value })} required placeholder="Например: Пакет, 50 семян" maxLength={300} /></label></div>
          <label>Раздел каталога<select value={productEditor.category} onChange={(event) => setProductEditor({ ...productEditor, category: event.target.value as ManagedPlant['category'] })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
          <label>Описание<textarea rows={6} value={productEditor.description} onChange={(event) => setProductEditor({ ...productEditor, description: event.target.value })} required maxLength={30000} /></label>
          <label className="admin-checkbox"><input type="checkbox" checked={!productEditor.hidden} onChange={(event) => setProductEditor({ ...productEditor, hidden: !event.target.checked })} /><span>Показывать товар на сайте</span></label>
          <details className="admin-extra" open={Boolean(productEditor.priceTiers?.length)}><summary>Количество и цены за объём</summary><label>Минимальное количество<input type="number" min={1} max={999} step={1} required value={productEditor.minimumQuantity ?? 1} onChange={(event) => setProductEditor({ ...productEditor, minimumQuantity: Number(event.target.value) })} /></label>{productEditor.priceTiers?.map((tier, index) => <label key={tier.minQuantity}>Цена от {tier.minQuantity} шт., ₽<input type="number" min="0.01" step="0.01" required value={tier.price} onChange={(event) => setProductEditor({ ...productEditor, priceTiers: productEditor.priceTiers?.map((item, itemIndex) => itemIndex === index ? { ...item, price: Number(event.target.value) } : item) })} /></label>)}</details>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <div className="admin-form-actions"><button className="button button-primary" type="submit">{saving ? 'Сохраняем…' : 'Сохранить'}</button><button className="button button-outline" type="button" onClick={closeEditor}>Отмена</button></div>
        </fieldset>
      </form>
    </section> : articleEditor ? <section className="admin-editor" ref={editorRef} aria-labelledby="admin-editor-title">
      <h2 id="admin-editor-title">{materials.some((article) => article.slug === articleEditor.article.slug) ? 'Изменить статью' : 'Добавить статью'}</h2>
      <form onSubmit={saveArticle} aria-busy={saving}>
        <fieldset disabled={saving}>
          <label>Название статьи<input value={articleEditor.article.title} onChange={(event) => setArticleEditor({ ...articleEditor, article: { ...articleEditor.article, title: event.target.value } })} required maxLength={300} /></label>
          <label>Текст статьи<textarea className="admin-article-text" rows={14} value={articleEditor.text} onChange={(event) => setArticleEditor({ ...articleEditor, text: event.target.value })} required maxLength={200000} /><small>Разделяйте абзацы пустой строкой.</small></label>
          <label>Тема статьи<input value={articleEditor.article.category} onChange={(event) => setArticleEditor({ ...articleEditor, article: { ...articleEditor.article, category: event.target.value } })} required maxLength={100} /></label>
          <label className="admin-checkbox"><input type="checkbox" checked={!articleEditor.hidden} onChange={(event) => setArticleEditor({ ...articleEditor, hidden: !event.target.checked })} /><span>Показывать статью на сайте</span></label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <div className="admin-form-actions"><button className="button button-primary" type="submit">{saving ? 'Сохраняем…' : 'Сохранить'}</button><button className="button button-outline" type="button" onClick={closeEditor}>Отмена</button></div>
        </fieldset>
      </form>
    </section> : <section className="admin-management" aria-labelledby="admin-list-title">
      <div className="admin-list-heading"><h2 id="admin-list-title">{section === 'products' ? 'Товары питомника' : 'Статьи о растениях'}</h2><button className="button button-primary" type="button" onClick={section === 'products' ? newProduct : newArticle}><span aria-hidden="true">+</span> {section === 'products' ? 'Добавить товар' : 'Добавить статью'}</button></div>
      <label className="admin-search">{section === 'products' ? 'Найти товар' : 'Найти статью'}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(20) }} placeholder={section === 'products' ? 'Название или номер' : 'Название статьи'} /></label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {loadingArticle && <p role="status">Открываем статью…</p>}
      <div className="admin-items">{section === 'products' ? filteredProducts.slice(0, limit).map((product) => <article key={product.catalogNumber} className="admin-item"><div className="admin-item-content"><p className="admin-item-meta">№ {product.catalogNumber}{product.hidden ? ' · Скрыт с сайта' : ''}</p><h3>{product.name}</h3><p>{product.price === null ? 'Цена по запросу' : `${new Intl.NumberFormat('ru-RU').format(product.price)} ₽`} · {product.unit}</p></div><button type="button" className="button button-outline" onClick={() => { setError(''); setMessage(''); setProductEditor({ ...product }) }}>Изменить<span className="sr-only"> товар {product.name}</span></button></article>) : filteredArticles.slice(0, limit).map((article) => <article key={article.slug} className="admin-item"><div className="admin-item-content"><p className="admin-item-meta">{article.category}{article.hidden ? ' · Скрыта с сайта' : ''}</p><h3>{article.title}</h3></div><button type="button" className="button button-outline" onClick={() => editArticle(article)} disabled={loadingArticle}>Изменить<span className="sr-only"> статью {article.title}</span></button></article>)}</div>
      {(section === 'products' ? filteredProducts : filteredArticles).length === 0 && <p className="admin-empty">Ничего не найдено. Попробуйте другое название.</p>}
      {(section === 'products' ? filteredProducts : filteredArticles).length > limit && <button type="button" className="button button-outline admin-show-more" onClick={() => setLimit((value) => value + 20)}>Показать ещё</button>}
    </section>}
  </>
}

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const passwordRef = useRef<HTMLInputElement>(null)
  const home = new URL('./', document.baseURI).href

  useEffect(() => {
    const controller = new AbortController()
    setChecking(true)
    setError('')
    adminRequest('session', { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setSession(data)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setSession({ authenticated: false })
        setError(reason instanceof Error ? reason.message : unavailableMessage)
      }
    }).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    document.title = `${session?.authenticated ? 'Кабинет администратора' : 'Вход в кабинет'} — Питомник Анисимова`
  }, [session?.authenticated])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const data = await adminRequest('login', { method: 'POST', body: JSON.stringify({ password }) })
      setSession(data)
      setPassword('')
      setShowPassword(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : unavailableMessage)
      passwordRef.current?.focus()
    } finally { setBusy(false) }
  }

  async function logout() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const data = await adminRequest('logout', { method: 'POST', headers: { 'X-CSRF-Token': session?.csrfToken ?? '' }, body: '{}' })
      setSession(data)
      setPassword('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : unavailableMessage)
    } finally { setBusy(false) }
  }

  return (
    <div className="admin-page">
      <a className="skip-link" href={`${window.location.pathname}#admin-main`}>Перейти к содержимому</a>
      <header className="admin-header">
        <div className="admin-container admin-header-inner">
          <a className="admin-brand" href={home}>
            <span className="admin-brand-mark"><LeafMark /></span>
            <span><strong>Питомник Анисимова</strong><small>Кабинет администратора</small></span>
          </a>
          <a className="admin-back" href={home}><span aria-hidden="true">←</span> На сайт</a>
        </div>
      </header>

      {checking ? (
        <main id="admin-main" className="admin-loading admin-container" aria-busy="true"><div className="admin-lock"><LockMark /></div><p role="status">Проверяем вход…</p></main>
      ) : session?.authenticated ? (
        <main id="admin-main" className="admin-container admin-dashboard">
          <div className="admin-dashboard-heading">
            <div><p className="admin-kicker">Питомник · сезон {catalogSeason.label}</p><h1>Кабинет администратора</h1><p>Выберите «Товары» или «Статьи», затем нажмите «Изменить».</p></div>
            <button type="button" className="button button-outline admin-logout" onClick={logout} disabled={busy}>{busy ? 'Выходим…' : 'Выйти'} <span aria-hidden="true">↗</span></button>
          </div>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <AdminManager csrfToken={session.csrfToken!} onSessionExpired={() => { setSession({ authenticated: false }); setError('Сеанс завершён. Войдите ещё раз.') }} />
        </main>
      ) : (
        <main id="admin-main" className="admin-login-wrap admin-container">
          <section className="admin-login-card" aria-labelledby="admin-login-title">
            <div className="admin-lock"><LockMark /></div>
            <p className="admin-kicker">Личный кабинет</p>
            <h1 id="admin-login-title">Вход в кабинет</h1>
            <p className="admin-login-lead">Введите пароль администратора, чтобы продолжить.</p>
            <form onSubmit={login} aria-busy={busy}>
              <label htmlFor="admin-password">Пароль</label>
              <div className="admin-password-field">
                <input ref={passwordRef} id="admin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} disabled={busy} aria-describedby={error ? 'admin-login-error' : undefined} />
                <button type="button" className="admin-password-toggle" onClick={() => setShowPassword((current) => !current)} disabled={busy} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPassword}>{showPassword ? 'Скрыть' : 'Показать'}</button>
              </div>
              {error && <div className="admin-error" id="admin-login-error" role="alert"><p>{error}</p>{error === unavailableMessage && <button type="button" onClick={() => setRetry((current) => current + 1)}>Повторить подключение</button>}</div>}
              <button className="button button-primary admin-submit" type="submit" disabled={busy || !password}>{busy ? 'Входим…' : 'Войти'}<span aria-hidden="true">→</span></button>
            </form>
            <p className="admin-login-footnote"><LockMark /> Доступ только для администратора питомника</p>
          </section>
          <p className="admin-bottom-note">Выращено в Сибири. С заботой о вашем саде.</p>
        </main>
      )}
      <footer className="admin-footer admin-container">Питомник Геннадия Павловича Анисимова · Томск</footer>
    </div>
  )
}
