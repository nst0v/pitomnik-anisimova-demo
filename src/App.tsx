import { lazy, Suspense, useEffect, useMemo, useRef, useState, type SVGProps } from 'react'
import { categories, categoryById, catalogSeason, NURSERY_EMAIL, plants, type CategoryId, type Plant, type PlantImage } from './data/plants'
import { normalizeSearch } from './lib/search'
import { copyText } from './lib/clipboard'
import ArticlesPreview from './components/ArticlesPreview'
import { articles, articleHref } from './data/articles'
import {
  buildRequestText,
  formatRubles,
  getCartLines,
  getCartSummary,
  getUnitPrice,
  getOrderEstimate,
  type Cart,
  type RequestFields,
} from './lib/request'

const STORAGE_KEY = 'anisimov-nursery-request-2027-v1'

type StoredDraft = {
  cart: Cart
  fields: RequestFields
}

const emptyFields: RequestFields = { name: '', contact: '', comment: '', address: '', customerCode: '', delivery: 'post', payment: '' }
const PAGE_SIZE = 24
const Articles = lazy(() => import('./components/Articles'))

function articleSlug(hash: string): string | null {
  try { return hash.startsWith('#/articles/') ? decodeURIComponent(hash.slice('#/articles/'.length).split('?')[0]) : null } catch { return 'not-found' }
}

function PhotoCredit({ image, detailed = false }: { image?: PlantImage; detailed?: boolean }) {
  if (!image?.attribution) return null
  const { author, license, licenseUrl } = image.attribution
  return (
    <p className="photo-credit">
      <strong>Иллюстрация</strong> · Фото: <a href={image.sourceUrl} target="_blank" rel="noreferrer">{author}</a>
      {' · '}<a href={licenseUrl} target="_blank" rel="noreferrer">{license}</a>
      {detailed && <span>Внешний вид растения, не экземпляр питомника. Копия уменьшена и переведена в WebP; края могут быть обрезаны при отображении. <a href="./IMAGE_CREDITS.md" target="_blank" rel="noreferrer">Все источники</a></span>}
    </p>
  )
}

function readStoredDraft(): StoredDraft {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { cart: {}, fields: emptyFields }
    const parsed = JSON.parse(raw) as Partial<StoredDraft>
    const knownNumbers = new Set(plants.map((plant) => String(plant.catalogNumber)))
    const cart = Object.fromEntries(
      Object.entries(parsed.cart ?? {})
        .filter(([number, quantity]) => knownNumbers.has(number) && Number.isFinite(quantity) && quantity > 0)
        .map(([number, quantity]) => [number, Math.max(plants.find((plant) => String(plant.catalogNumber) === number)?.minimumQuantity ?? 1, Math.min(999, Math.floor(quantity)))]),
    )
    return {
      cart,
      fields: {
        name: typeof parsed.fields?.name === 'string' ? parsed.fields.name : '',
        contact: typeof parsed.fields?.contact === 'string' ? parsed.fields.contact : '',
        comment: typeof parsed.fields?.comment === 'string' ? parsed.fields.comment : '',
        address: typeof parsed.fields?.address === 'string' ? parsed.fields.address : '',
        customerCode: typeof parsed.fields?.customerCode === 'string' ? parsed.fields.customerCode : '',
        delivery: ['post', 'ozon', 'yandex', '5post'].includes(parsed.fields?.delivery ?? '') ? parsed.fields!.delivery : 'post',
        payment: typeof parsed.fields?.payment === 'string' ? parsed.fields.payment : '',
      },
    }
  } catch {
    return { cart: {}, fields: emptyFields }
  }
}

function IconBase({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

const SearchIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></IconBase>
)
const BasketIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><path d="M4 9h16l-1.3 10H5.3L4 9Z" /><path d="m8 9 4-5 4 5" /></IconBase>
)
const ArrowIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><path d="M5 12h14M14 7l5 5-5 5" /></IconBase>
)
const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>
)
const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><path d="M12 5v14M5 12h14" /></IconBase>
)
const MinusIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><path d="M5 12h14" /></IconBase>
)
const CopyIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></IconBase>
)
const MailIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></IconBase>
)
const LeafIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><path d="M20 4C12 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16Z" /><path d="M5 20c2-5 6-9 12-12" /></IconBase>
)
const PhoneIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><path d="M7 4 4.5 6.5c-.9.9.2 4.7 4.1 8.6s7.7 5 8.6 4.1l2.5-2.5-4-3-2 2c-1.7-.7-4.5-3.5-5.2-5.2l2-2-3.5-4Z" /></IconBase>
)
const DownloadIcon = (props: SVGProps<SVGSVGElement>) => (
  <IconBase {...props}><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></IconBase>
)

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <LeafIcon />
    </span>
  )
}

function QuantityInput({ quantity, minimum, onCommit, name }: { quantity: number; minimum: number; onCommit: (quantity: number) => void; name: string }) {
  const [value, setValue] = useState(String(quantity))
  useEffect(() => { setValue(String(quantity)) }, [quantity])
  const commit = () => {
    const number = Number(value)
    if (!Number.isFinite(number) || !value.trim()) { setValue(String(quantity)); return }
    const next = Math.max(minimum, Math.min(999, Math.floor(number)))
    setValue(String(next))
    onCommit(next)
  }
  return <><input type="number" inputMode="numeric" min={minimum} max={999} step={1} value={value} onChange={(event) => setValue(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} aria-label={`Количество: ${name}`} /><output className="sr-only" aria-live="polite">{quantity}</output></>
}

function App() {
  const [hash, setHash] = useState(window.location.hash)
  const articlesOpen = hash === '#/articles' || hash === '#/articles/' || hash.startsWith('#/articles/')
  const initialDraft = useMemo(readStoredDraft, [])
  const [cart, setCart] = useState<Cart>(initialDraft.cart)
  const [fields, setFields] = useState<RequestFields>(initialDraft.fields)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | CategoryId>('all')
  const [sort, setSort] = useState('catalog')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const detailDialogRef = useRef<HTMLDialogElement>(null)
  const requestDialogRef = useRef<HTMLDialogElement>(null)
  const requestPreviewRef = useRef<HTMLDetailsElement>(null)
  const copyTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (articlesOpen) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    document.title = 'Питомник Анисимова — каталог растений 2026–2027'
    if (hash && !hash.startsWith('#/')) {
      const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'instant' }))
      return () => cancelAnimationFrame(frame)
    }
  }, [hash, articlesOpen])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, fields }))
      setStorageUnavailable(false)
    } catch {
      setStorageUnavailable(true)
    }
  }, [cart, fields])

  useEffect(() => () => window.clearTimeout(copyTimerRef.current), [])

  useEffect(() => {
    const dialog = detailDialogRef.current
    if (!dialog) return
    if (selectedPlant && !dialog.open) dialog.showModal()
    if (!selectedPlant && dialog.open) dialog.close()
  }, [selectedPlant])

  useEffect(() => {
    const dialog = requestDialogRef.current
    if (!dialog) return
    if (requestOpen && !dialog.open) dialog.showModal()
    if (!requestOpen && dialog.open) dialog.close()
  }, [requestOpen])

  const filteredPlants = useMemo(() => {
    const query = normalizeSearch(search)
    const result = plants.filter((plant) => {
      const matchesCategory = category === 'all' || plant.category === category
      const haystack = normalizeSearch(`${plant.catalogNumber} ${plant.name} ${plant.latinName ?? ''}`)
      const matchesQuery = /^\d+$/.test(query) ? plant.catalogNumber === Number(query) : haystack.includes(query)
      return matchesCategory && (!query || matchesQuery)
    })
    if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    if (sort === 'price-asc') result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    if (sort === 'price-desc') result.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    return result
  }, [category, search, sort])

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [category, search, sort])

  const cartLines = useMemo(() => getCartLines(cart, plants), [cart])
  const cartSummary = useMemo(() => getCartSummary(cartLines), [cartLines])
  const estimate = useMemo(() => getOrderEstimate(cartLines, fields), [cartLines, fields])
  const requestText = useMemo(() => buildRequestText(cartLines, fields), [cartLines, fields])
  const selectedPositions = cartLines.length
  const mailtoHref = `mailto:${NURSERY_EMAIL}?subject=${encodeURIComponent('Заказ по каталогу 2026–2027 — питомник Анисимова')}&body=${encodeURIComponent(requestText)}`

  const addToCart = (plant: Plant) => {
    const key = String(plant.catalogNumber)
    setCart((current) => ({ ...current, [key]: Math.min(999, current[key] ? current[key] + (plant.quantityStep ?? 1) : (plant.minimumQuantity ?? 1)) }))
  }

  const setQuantity = (plantNumber: number, nextQuantity: number) => {
    const key = String(plantNumber)
    setCart((current) => {
      if (nextQuantity <= 0) {
        const next = { ...current }
        delete next[key]
        return next
      }
      const plant = plants.find((item) => item.catalogNumber === plantNumber)
      if (nextQuantity < (plant?.minimumQuantity ?? 1)) {
        const next = { ...current }
        delete next[key]
        return next
      }
      return { ...current, [key]: Math.min(999, nextQuantity) }
    })
  }

  const copyRequest = async () => {
    if (!requestDialogRef.current) return
    window.clearTimeout(copyTimerRef.current)
    const copied = await copyText(requestText, requestDialogRef.current)
    setCopyStatus(copied ? 'Текст заявки скопирован' : 'Не удалось скопировать. Выделите текст заявки вручную.')
    if (!copied && requestPreviewRef.current) {
      requestPreviewRef.current.open = true
      requestPreviewRef.current.scrollIntoView({ block: 'nearest' })
    }
    if (copied) copyTimerRef.current = window.setTimeout(() => setCopyStatus(''), 2800)
  }

  const resetFilters = () => {
    setSearch('')
    setCategory('all')
  }

  const downloadRequest = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + requestText], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'zakaz-anisimov-2027.txt'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <a className="skip-link" href="#main">Перейти к содержанию</a>

      <div className="season-bar"><div className="container"><span>Из Томска — в ваш сад</span><a href={catalogSeason.downloadUrl} download>Каталог сезона 2026–2027 <DownloadIcon /></a></div></div>

      <header className="site-header">
        <div className="header-inner container">
          <a className="brand" href="#top" aria-label="Питомник Анисимова — к началу страницы">
            <BrandMark />
            <span><strong>Питомник Анисимова</strong><small>Редкие растения · с 1991 года</small></span>
          </a>
          <nav className="main-nav" aria-label="Основная навигация">
            <a href="#catalog">Каталог</a>
            <a href="#order">Как заказать</a>
            <a href="#/articles" aria-current={articlesOpen ? 'page' : undefined}>Статьи</a>
            <a href="#about">О питомнике</a>
            <a href="#contacts">Контакты</a>
          </nav>
          <a className="header-contact" href="tel:+79138518103" aria-label="Позвонить в питомник: +7 913 851-81-03">
            <PhoneIcon />
            <span><small>Мобильный</small><strong>+7 913 851-81-03</strong></span>
          </a>
          <button className="request-button" type="button" onClick={() => setRequestOpen(true)} aria-label={`Моя заявка, выбрано позиций: ${selectedPositions}`}>
            <BasketIcon />
            <span className="request-label"><span className="desktop-label">Моя заявка</span><span className="mobile-label">Заявка</span></span>
            <span className="request-count" aria-hidden="true">{selectedPositions}</span>
          </button>
        </div>
        <nav className="mobile-nav container" aria-label="Навигация по странице">
          <a href="#catalog">Каталог</a>
          <a href="#order">Как заказать</a>
          <a href="#/articles" aria-current={articlesOpen ? 'page' : undefined}>Статьи</a>
          <a href="#about">О питомнике</a>
          <a href="#contacts">Контакты</a>
        </nav>
      </header>

      <main id="main">
        {articlesOpen ? <Suspense fallback={<section className="article-state container" aria-live="polite"><p>Открываем библиотеку садовода…</p></section>}><Articles slug={articleSlug(hash)} onSelectPlant={(number) => { setSearch(String(number)); setCategory('all') }} /></Suspense> : <>
        <section className="hero" id="top">
          <div className="hero-inner container">
            <div className="hero-copy">
              <p className="eyebrow"><span /> Авторская коллекция · сезон 2026–2027</p>
              <h1>В вашем саду<br />найдётся место<br /><em>редкому.</em></h1>
              <p className="hero-lead">
                Цветы, пряные травы, необычные овощи и саженцы из питомника Геннадия Павловича Анисимова в Томске. Выращиваем, собираем вручную и отправляем вам.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#catalog">Посмотреть каталог <ArrowIcon /></a>
                <a className="text-link" href={catalogSeason.downloadUrl} download><DownloadIcon /> Каталог в Word</a>
              </div>
              <dl className="hero-facts" aria-label="О питомнике и каталоге">
                <div><dt>{plants.filter((plant) => plant.category !== 'catalog').length}</dt><dd>позиций для вашего сада</dd></div>
                <div><dt>3–5 дней</dt><dd>на отправку семян после аванса</dd></div>
                <div><dt>35 лет</dt><dd>рассылаем растения с заботой</dd></div>
              </dl>
            </div>
            <figure className="hero-media">
              <img className="hero-photo-main" src="./images/trollius-asiaticus.jpg" alt="Оранжевые цветы купальницы азиатской из коллекции питомника" fetchPriority="high" />
              <div className="hero-photo-small">
                <img src="./images/campanula-latifolia.jpg" alt="Фиолетовый колокольчик широколистный из коллекции питомника" />
              </div>
              <div className="hero-season-stamp"><small>Коллекция</small><strong>2027</strong><span>выращено в Сибири</span></div>
              <figcaption><LeafIcon /> Купальница азиатская · из нашего сада</figcaption>
            </figure>
          </div>
        </section>

        <div className="benefits-strip"><div className="container benefits-inner">
          <div><LeafIcon /><span><strong>Семена из своего питомника</strong><small>Ручной сбор и подготовка</small></span></div>
          <div><BasketIcon /><span><strong>От одного пакета семян</strong><small>Без минимальной суммы заказа</small></span></div>
          <div><MailIcon /><span><strong>Доставка по России</strong><small>Почта, OZON, Яндекс и 5 Post</small></span></div>
          <div><span className="benefit-percent">10%</span><span><strong>Скидка постоянным заказчикам</strong><small>И на заказы свыше 8 000 ₽</small></span></div>
        </div></div>

        <section className="catalog-section section" id="catalog">
          <div className="container">
            <div className="section-heading catalog-heading">
              <div>
                <p className="section-kicker">Каталог 2026–2027</p>
                <h2>Что вырастет в вашем саду?</h2>
                <p>Знакомые любимцы и редкости, которые непросто найти. Выберите растения — мы соберём их номера и количество в готовое письмо.</p>
                <p className="catalog-photo-note">Цены действуют до 15 октября 2027 года. Фото показывают внешний вид растений; авторы указаны в карточках.</p>
              </div>
              <button className="button button-outline catalog-request" type="button" onClick={() => setRequestOpen(true)}>
                <BasketIcon /> Открыть заявку <span>{selectedPositions}</span>
              </button>
            </div>

            <div className="catalog-controls" aria-label="Поиск и фильтры каталога">
              <label className="search-field">
                <span className="sr-only">Найти растение по названию или номеру</span>
                <SearchIcon />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Название или номер, например 42" autoComplete="off" />
              </label>
              <div className="category-filters" role="group" aria-label="Фильтр по категориям">
                <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')} aria-pressed={category === 'all'}>Все <span>{plants.length}</span></button>
                {categories.map((item) => (
                  <button key={item.id} type="button" className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)} aria-pressed={category === item.id}>
                    {item.shortLabel} <span>{plants.filter((plant) => plant.category === item.id).length}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="results-row">
              <p aria-live="polite">Найдено: <strong>{filteredPlants.length}</strong>{(search || category !== 'all') && <button type="button" onClick={resetFilters}>Сбросить фильтры</button>}</p>
              <label className="sort-control"><span>Сортировка</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка растений"><option value="catalog">По каталогу</option><option value="name">По названию</option><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option></select></label>
            </div>

            {filteredPlants.length > 0 ? (
              <div className="plant-grid">
                {filteredPlants.slice(0, visibleCount).map((plant) => {
                  const quantity = cart[String(plant.catalogNumber)] ?? 0
                  return (
                    <article className="plant-card" key={plant.catalogNumber}>
                      {plant.image ? (
                        <div className="plant-photo">
                          <img src={plant.image.src} alt={plant.image.alt} loading="lazy" decoding="async" />
                          <span>№ {plant.catalogNumber}</span>
                        </div>
                      ) : (
                        <div className={`plant-photo plant-photo-empty ${plant.category === 'catalog' ? 'catalog-cover' : ''}`}>
                          <span>№ {plant.catalogNumber}</span>
                          <LeafIcon />
                          {plant.category === 'catalog' ? <><b>Каталог<br />редких растений</b><small>Сезон 2027–2028 · Томск</small></> : <small>Фото растения готовится</small>}
                        </div>
                      )}
                      <div className="plant-body">
                        <PhotoCredit image={plant.image} />
                        <p className="plant-category">{categoryById[plant.category].shortLabel}</p>
                        <h3>{plant.name}</h3>
                        {plant.latinName && <p className="latin-name">{plant.latinName}</p>}
                        <p className="plant-description">{plant.description}</p>
                        <div className="plant-meta">
                          <p><span>Единица</span><strong>{plant.unit}</strong></p>
                          <p><span>Цена</span><strong>{plant.price === null ? 'По запросу' : formatRubles(plant.price)}</strong></p>
                        </div>
                        {plant.minimumQuantity && plant.minimumQuantity > 1 ? <p className="minimum-note">Минимум {plant.minimumQuantity} шт.{plant.priceTiers?.length ? ' · есть скидка за количество' : ''}</p> : null}
                        <div className="plant-actions">
                          <button type="button" className="details-button" onClick={() => setSelectedPlant(plant)}>Подробнее</button>
                          <button type="button" className={`add-button ${quantity ? 'added' : ''}`} onClick={() => addToCart(plant)}>
                            {quantity ? <><PlusIcon /> В заявке: {quantity}</> : <><PlusIcon /> В заявку</>}
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="empty-results">
                <SearchIcon />
                <h3>Растения не найдены</h3>
                <p>Попробуйте другое название или номер из каталога. Можно также сбросить выбранную категорию.</p>
                <button className="button button-primary" type="button" onClick={resetFilters}>Показать все растения</button>
              </div>
            )}
            {filteredPlants.length > visibleCount && <div className="catalog-load-more"><p>Показано {Math.min(visibleCount, filteredPlants.length)} из {filteredPlants.length}</p><button className="button button-outline" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Показать ещё {Math.min(PAGE_SIZE, filteredPlants.length - visibleCount)} <PlusIcon /></button></div>}
            <div className="catalog-download"><div><DownloadIcon /><div><strong>Каталог всегда под рукой</strong><p>Полные описания растений, цены и условия заказа в одном Word-файле.</p></div></div><a className="button button-outline" href={catalogSeason.downloadUrl} download>Скачать каталог 2027 <DownloadIcon /></a></div>
          </div>
        </section>

        <section className="order-section section" id="order">
          <div className="container">
            <div className="section-heading order-heading">
              <div>
                <p className="section-kicker light">От выбора до первых всходов</p>
                <h2>С заботой о каждом заказе</h2>
              </div>
              <p>Можно заказать даже один пакет семян. В каждом фирменном пакете — инструкция по агротехнике, количество семян и срок годности. Условия сезона действуют до 15 октября 2027 года.</p>
            </div>

            <ol className="order-steps">
              <li><span>01</span><div><h3>Найдите своё растение</h3><p>Добавьте выбранное в заявку. Номера и количество соберутся автоматически. Для семян минимальной суммы заказа нет.</p></div></li>
              <li><span>02</span><div><h3>Заполните заявку</h3><p>Укажите Ф.И.О. полностью, мобильный телефон, адрес с индексом или адрес ПВЗ. Постоянным заказчикам — также свой код.</p></div></li>
              <li><span>03</span><div><h3>Оплатите и сообщите</h3><p>Внесите оплату или аванс по условиям ниже. Отправьте письмо с заявкой, суммой и датой перевода. Заказы выполняются после оплаты или аванса.</p></div></li>
              <li><span>04</span><div><h3>Получите отправление</h3><p>Семена и саженцы отправляются отдельно. После отправки питомник сообщает почтовый идентификатор для отслеживания.</p></div></li>
            </ol>

            <div className="order-details">
              <article>
                <p className="detail-label">Доставка по России</p>
                <h3>Выберите удобный способ</h3>
                <table className="shipping-table"><thead><tr><th>Отправление</th><th>Почта</th><th>OZON / Яндекс / 5 Post</th></tr></thead><tbody><tr><th>Семена</th><td>390 ₽</td><td>230 ₽</td></tr><tr><th>Саженцы, корни, луковицы</th><td>550 ₽</td><td>390 ₽</td></tr></tbody></table>
                <p>Семена Почтой России — посылками 1 класса. Семена и посадочный материал отправляем раздельно: если в заказе есть и то и другое, оплачиваются два отправления.</p>
              </article>
              <article>
                <p className="detail-label">Сроки отправки</p>
                <h3>Семена — через 3–5 дней</h3>
                <p>После получения аванса. Саженцы, луковицы, клубни и корни — в сезонные сроки, указанные в карточке растения. После отправки сообщаем трек-номер, в посылку вкладываем распечатку заказа с названиями.</p>
                <p className="international-note">За пределы России — по предварительному согласованию, тарифам Почты России и полной предоплате.</p>
              </article>
              <aside>
                <strong>Ваша скидка — 10%</strong>
                <p>Для постоянных заказчиков и заказов на сумму свыше 8 000 ₽. После первого заказа вы получаете код, который даёт право на скидку со следующего сезона. Указывайте его при следующих обращениях.</p>
                <button className="order-start" type="button" onClick={() => setRequestOpen(true)}>Составить заявку <ArrowIcon /></button>
              </aside>
            </div>

            <div className="order-faq">
              <details open><summary>Как оплатить заказ</summary><div><p>Переводом на карту Сбербанка, привязанную к мобильному <a href="tel:+79138518103">+7 913 851-81-03</a>. Владелец — Геннадий Павлович А. Другой вариант — почтовый перевод: Анисимову Геннадию Павловичу, 634034, Россия, г. Томск, а/я 343.</p><p>Почтовые посылки можно оплатить полностью: товар + доставка. Либо внести аванс: доставка + не менее 30% стоимости товара. Остаток оплачивается наложенным платежом, при этом пересылка может обойтись дороже. Заказы через OZON, Яндекс и 5 Post — только по полной предоплате.</p><p>Семена и саженцы можно оплатить одним переводом, включив доставку обоих отправлений. В заявке укажите сумму и дату перевода или реквизиты банковского перечисления.</p></div></details>
              <details><summary>Как отправить заказ и записать номера</summary><div><p>Сайт подготовит письмо на <a href={`mailto:${NURSERY_EMAIL}`}>{NURSERY_EMAIL}</a>. Откройте его в почтовом приложении или скопируйте заявку в свою почту. В каталоге также предусмотрены заказы по телефону, SMS, WhatsApp, Telegram, MAX и обычным письмом.</p><p>При ручной записи указывайте только номера по каталогу. Если пакетов несколько, добавьте количество через тире. Пример из каталога: <strong>40, 109, 117-2, 161-3, 210-10</strong> — по одному пакету купальницы и кипрея, два левзеи, три чеснока и десять луковиц черемши.</p><p>Не забудьте полные Ф.И.О., мобильный телефон, домашний адрес с индексом или адрес ПВЗ, сумму и дату перевода, а также код заказчика, если он у вас есть.</p></div></details>
              <details><summary>Как получить каталог следующего сезона</summary><div><p>Ассортимент обновляется ежегодно. Каталог 2027–2028 рассылается с ноября 2027 года. Добавьте в заказ позицию № 212 за 60 ₽ — и получите его в нашем конверте.</p><p>Можно прислать маркированный конверт со своим адресом: в нём печатный каталог придёт бесплатно. Электронную Word-версию можно запросить по почте.</p><a href={catalogSeason.downloadUrl} download>Скачать текущий каталог 2026–2027 в Word <DownloadIcon /></a></div></details>
            </div>
          </div>
        </section>

        <section className="about-section section" id="about">
          <div className="container about-grid">
            <div className="about-visual">
              <div className="about-photo-frame">
                <img src="./images/gennady-anisimov.gif" alt="Геннадий Павлович Анисимов" loading="lazy" />
                <span>Геннадий Павлович Анисимов<br />основатель питомника</span>
              </div>
              <img className="about-plant-photo" src="./images/cephalaria-gigantea.jpg" alt="Головчатка гигантская в коллекции питомника" loading="lazy" />
            </div>
            <div className="about-copy">
              <p className="section-kicker">О питомнике</p>
              <h2>Большая любовь<br />к редким растениям</h2>
              <p className="about-lead">Геннадий Павлович более 40 лет занимается садоводством и собирает редкие растения. С 1991 года вместе с помощниками он отправляет выращенные в собственном питомнике семена, луковицы и саженцы.</p>
              <p>В коллекции — несколько сотен растений, многие из которых трудно найти в садовых центрах. Семена собираем и готовим вручную. На фирменных пакетах печатаем всё нужное для начала: агротехнику, количество семян и срок годности.</p>
              <p>Наш опыт выращивания редких растений лёг в основу статей в более чем пятидесяти газетах и журналах России. Продолжаем испытывать новинки и делиться растениями с увлечёнными садоводами.</p>
              <blockquote>«Индивидуальный подход — это наш конёк»</blockquote>
              <div className="about-points">
                <div><strong>Томск</strong><span>небольшой авторский питомник</span></div>
                <div><strong>С 1991 года</strong><span>рассылка посадочного материала</span></div>
                <div><strong>Ручная работа</strong><span>сбор и подготовка семян</span></div>
              </div>
              <a className="source-link" href="#/articles">Статьи о растениях и выращивании <ArrowIcon /></a>
            </div>
          </div>
        </section>

        <ArticlesPreview />

        <section className="contacts-section" id="contacts">
          <div className="container contacts-grid">
            <div>
              <p className="section-kicker light">Связаться с питомником</p>
              <h2>Ваш сад начинается с разговора</h2>
              <p>Поможем с выбором растений и ответим на вопросы о заказе. Удобнее всего написать на электронную почту — так все детали будут под рукой.</p>
              <button className="button button-warm" type="button" onClick={() => setRequestOpen(true)}><BasketIcon /> Составить заявку</button>
            </div>
            <address className="contact-list">
              <a href={`mailto:${NURSERY_EMAIL}`}><span><MailIcon /></span><div><small>Электронная почта</small><strong>{NURSERY_EMAIL}</strong></div></a>
              <a href="tel:+79138518103"><span><PhoneIcon /></span><div><small>Мобильный телефон</small><strong>+7 913 851-81-03</strong></div></a>
              <a href="tel:+73822412436"><span><PhoneIcon /></span><div><small>Городской телефон</small><strong>+7 (3822) 41-24-36</strong></div></a>
              <div><span className="contact-letter">ЧАТ</span><div><small>WhatsApp · Telegram · MAX</small><strong>+7 913 105-53-08</strong></div></div>
              <div><span className="contact-letter">а/я</span><div><small>Почтовый адрес</small><strong>634034, Россия, г. Томск, а/я 343</strong></div></div>
            </address>
          </div>
        </section>
        </>}
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <a className="brand footer-brand" href="#top"><BrandMark /><span><strong>Питомник Анисимова</strong><small>© 2026 · Томск · С любовью к растениям с 1991 года</small></span></a>
          <p>Авторская коллекция Геннадия Павловича Анисимова.<br />Каталог сезона 2026–2027.</p>
          <a href={catalogSeason.downloadUrl} download>Каталог в Word <DownloadIcon /></a>
        </div>
      </footer>

      <dialog className="detail-dialog" ref={detailDialogRef} onClose={() => setSelectedPlant(null)} onClick={(event) => { if (event.target === event.currentTarget) setSelectedPlant(null) }} aria-labelledby={selectedPlant ? `detail-title-${selectedPlant.catalogNumber}` : undefined}>
        {selectedPlant && (
          <div className="detail-dialog-card">
            <button className="dialog-close" type="button" onClick={() => setSelectedPlant(null)} aria-label="Закрыть подробности"><CloseIcon /></button>
            {selectedPlant.image ? <img className="detail-photo" src={selectedPlant.image.src} alt={selectedPlant.image.alt} /> : <div className="detail-photo detail-photo-empty"><LeafIcon /><span>Для этой позиции фото на исходном сайте не опубликовано</span></div>}
            <div className="detail-content">
              <p className="plant-category">{categoryById[selectedPlant.category].label} · № {selectedPlant.catalogNumber}</p>
              <h2 id={`detail-title-${selectedPlant.catalogNumber}`}>{selectedPlant.name}</h2>
              {selectedPlant.latinName && <p className="latin-name">{selectedPlant.latinName}</p>}
              <PhotoCredit image={selectedPlant.image} detailed />
              <p className="detail-description">{selectedPlant.description}</p>
              {(selectedPlant.note || selectedPlant.priceNote || selectedPlant.shippingNote) && (
                <div className="detail-notes">
                  {selectedPlant.note && <p>{selectedPlant.note}</p>}
                  {selectedPlant.priceNote && <p>{selectedPlant.priceNote}</p>}
                  {selectedPlant.shippingNote && <p>{selectedPlant.shippingNote}</p>}
                </div>
              )}
              <div className="detail-price-row">
                <p><span>Единица продажи</span><strong>{selectedPlant.unit}</strong></p>
                <p><span>Цена из каталога</span><strong>{selectedPlant.price === null ? 'Не указана' : formatRubles(selectedPlant.price)}</strong></p>
              </div>
              {selectedPlant.priceTiers && selectedPlant.priceTiers.length > 0 && <div className="price-tiers"><strong>Цена за количество</strong>{selectedPlant.priceTiers.map((tier) => <p key={tier.minQuantity}><span>От {tier.minQuantity} шт.</span><b>{formatRubles(tier.price)} / шт.</b></p>)}</div>}
              <p className="season-validity">Каталог 2026–2027 · цены действуют до 15 октября 2027 года{selectedPlant.minimumQuantity && selectedPlant.minimumQuantity > 1 ? ` · минимальный заказ ${selectedPlant.minimumQuantity} шт.` : ''}</p>
              <div className="detail-actions">
                <button className="button button-primary" type="button" onClick={() => addToCart(selectedPlant)}><PlusIcon /> Добавить в заявку{cart[String(selectedPlant.catalogNumber)] ? ` · ${cart[String(selectedPlant.catalogNumber)]}` : ''}</button>
                <a href={selectedPlant.sourceUrl} target="_blank" rel="noreferrer">Описание в каталоге Word <DownloadIcon /></a>
              </div>
              {articles.some((article) => article.plantNumbers.includes(selectedPlant.catalogNumber)) && <div className="plant-article-links"><strong>Почитать об этом растении</strong>{articles.filter((article) => article.plantNumbers.includes(selectedPlant.catalogNumber)).slice(0, 3).map((article) => <a href={articleHref(article)} key={article.slug} onClick={() => setSelectedPlant(null)}>{article.title} ↗</a>)}</div>}
            </div>
          </div>
        )}
      </dialog>

      <dialog className="request-dialog" ref={requestDialogRef} onClose={() => setRequestOpen(false)} aria-labelledby="request-title">
        <div className="request-shell">
          <header className="request-header">
            <div><p className="section-kicker">Сезон 2026–2027</p><h2 id="request-title">Моя заявка</h2><p>Позиций: {selectedPositions} · Единиц: {cartSummary.unitsCount}</p></div>
            <button className="dialog-close" type="button" onClick={() => setRequestOpen(false)} aria-label="Закрыть заявку"><CloseIcon /></button>
          </header>

          <div className="request-layout">
            <section className="cart-panel" aria-label="Выбранные растения">
              {cartLines.length ? (
                <>
                  <ul className="cart-lines">
                    {cartLines.map(({ plant, quantity }) => (
                      <li key={plant.catalogNumber}>
                        <div className={`cart-thumb ${plant.image ? '' : 'empty'}`}>
                          {plant.image ? <img src={plant.image.src} alt="" /> : <LeafIcon />}
                        </div>
                        <div className="cart-line-main">
                          <span>№ {plant.catalogNumber}</span>
                          <h3>{plant.name}</h3>
                          <p>{plant.unit} · {plant.price === null ? 'цена не указана' : formatRubles(getUnitPrice(plant, quantity) ?? 0)}{plant.minimumQuantity && plant.minimumQuantity > 1 ? ` · от ${plant.minimumQuantity} шт.` : ''}</p>
                          <div className="cart-line-controls">
                            <div className="quantity-control" aria-label={`Количество: ${plant.name}`}>
                              <button type="button" onClick={() => setQuantity(plant.catalogNumber, quantity - (plant.quantityStep ?? 1))} aria-label="Уменьшить количество"><MinusIcon /></button>
                              <QuantityInput quantity={quantity} minimum={plant.minimumQuantity ?? 1} onCommit={(next) => setQuantity(plant.catalogNumber, next)} name={plant.name} />
                              <button type="button" onClick={() => setQuantity(plant.catalogNumber, quantity + (plant.quantityStep ?? 1))} aria-label="Увеличить количество"><PlusIcon /></button>
                            </div>
                            <button className="remove-button" type="button" onClick={() => setQuantity(plant.catalogNumber, 0)}>Удалить</button>
                          </div>
                        </div>
                        <strong className="cart-line-total">{plant.price === null ? '—' : formatRubles((getUnitPrice(plant, quantity) ?? 0) * quantity)}</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="cart-summary">
                    <span>Стоимость позиций</span><strong>{formatRubles(cartSummary.knownTotal)}</strong>
                    {estimate.discount > 0 && <><span className="estimate-label">Скидка 10%{fields.customerCode?.trim() ? ' по коду*' : ''}</span><b className="estimate-value">−{formatRubles(estimate.discount)}</b></>}
                    <span className="estimate-label">Доставка{estimate.shipments > 1 ? ' · 2 отправления' : ''}</span><b className="estimate-value">{formatRubles(estimate.shippingTotal)}</b>
                    <span className="estimate-total">Итого с доставкой</span><strong className="estimate-total">{formatRubles(estimate.total)}</strong>
                    <p>Для отправки по России. {fields.delivery === 'post' ? `Минимальный аванс: ${formatRubles(estimate.minimumAdvance)}. При наложенном платеже пересылка может быть дороже.` : 'Для OZON, Яндекс и 5 Post — полная предоплата.'}</p>
                    {fields.customerCode?.trim() && <p>*Право на скидку по коду подтверждает питомник.</p>}
                    {cartSummary.unknownPriceCount > 0 && <p className="unknown-price">{cartSummary.unknownPriceCount} позиций без цены не включены в сумму.</p>}
                  </div>
                </>
              ) : (
                <div className="empty-cart">
                  <LeafIcon />
                  <h3>В заявке пока пусто</h3>
                  <p>Добавьте растения из каталога — выбранное сохранится после обновления страницы.</p>
                  <button className="button button-primary" type="button" onClick={() => setRequestOpen(false)}>Вернуться в каталог</button>
                </div>
              )}
            </section>

            <section className="request-form-panel" aria-label="Контакты для заявки">
              <div className="request-form-heading"><h3>Получатель и доставка</h3><p>Заполните данные и отправьте подготовленное письмо. Если хотите сначала задать вопрос, оставьте его в комментарии.</p></div>
              {storageUnavailable && <p className="outdated-note" role="status">Браузер не сохраняет черновик. Скопируйте заявку до закрытия или обновления страницы.</p>}
              <label><span>Ф.И.О. полностью</span><input type="text" value={fields.name} onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))} placeholder="Фамилия, имя, отчество" autoComplete="name" /></label>
              <label><span>Телефон или электронная почта</span><input type="text" value={fields.contact} onChange={(event) => setFields((current) => ({ ...current, contact: event.target.value }))} placeholder="Для заказа укажите мобильный телефон" autoComplete="tel" /></label>
              <label><span>Способ доставки</span><select value={fields.delivery ?? 'post'} onChange={(event) => setFields((current) => ({ ...current, delivery: event.target.value as RequestFields['delivery'] }))}><option value="post">Почта России · 1 класс</option><option value="ozon">OZON</option><option value="yandex">Яндекс Доставка</option><option value="5post">Пятёрочка · 5 Post</option></select></label>
              <label><span>Адрес доставки с индексом или адрес ПВЗ</span><textarea value={fields.address ?? ''} onChange={(event) => setFields((current) => ({ ...current, address: event.target.value }))} placeholder="Индекс, город, улица, дом, квартира или адрес пункта выдачи" autoComplete="street-address" rows={2} /></label>
              <label><span>Код постоянного заказчика <small>если есть</small></span><input type="text" value={fields.customerCode ?? ''} onChange={(event) => setFields((current) => ({ ...current, customerCode: event.target.value }))} placeholder="Код из предыдущего заказа" /></label>
              <label><span>Сумма и дата оплаты <small>если уже оплатили</small></span><input type="text" value={fields.payment ?? ''} onChange={(event) => setFields((current) => ({ ...current, payment: event.target.value }))} placeholder="Например, 1 200 ₽, 26.11.2026" /></label>
              <label><span>Комментарий <small>необязательно</small></span><textarea value={fields.comment} onChange={(event) => setFields((current) => ({ ...current, comment: event.target.value }))} placeholder="Город доставки, вопросы по срокам или растениям" rows={4} /></label>

              <details className="request-preview" ref={requestPreviewRef}>
                <summary>Посмотреть текст заявки</summary>
                <pre>{requestText}</pre>
              </details>

              <div className="request-actions">
                <button className="button button-outline" type="button" onClick={copyRequest} disabled={!cartLines.length}><CopyIcon /> {copyStatus === 'Текст заявки скопирован' ? copyStatus : 'Скопировать заявку'}</button>
                <a className={`button button-primary ${cartLines.length ? '' : 'disabled'}`} href={cartLines.length ? mailtoHref : undefined} aria-disabled={!cartLines.length}><MailIcon /> Открыть письмо</a>
              </div>
              <button className="download-request" type="button" onClick={downloadRequest} disabled={!cartLines.length}><DownloadIcon /> Скачать заявку файлом .txt</button>
              <p className="mail-explanation">«Открыть письмо» запускает ваше почтовое приложение. Проверьте и отправьте письмо. Если почта не настроена или заявка открылась не полностью, скопируйте её и отправьте на <a href={`mailto:${NURSERY_EMAIL}`}>{NURSERY_EMAIL}</a>. Черновик сохраняется в этом браузере.</p>
              <p className={copyStatus && copyStatus !== 'Текст заявки скопирован' ? 'outdated-note' : 'copy-live'} aria-live="polite">{copyStatus}</p>
            </section>
          </div>
        </div>
      </dialog>
    </>
  )
}

export default App
