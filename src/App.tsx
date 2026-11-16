import { useEffect, useMemo, useRef, useState, type SVGProps } from 'react'
import { categories, categoryById, plants, type CategoryId, type Plant } from './data/plants'
import {
  buildRequestText,
  formatRubles,
  getCartLines,
  getCartSummary,
  type Cart,
  type RequestFields,
} from './lib/request'

const STORAGE_KEY = 'anisimov-nursery-request-v1'
const NURSERY_EMAIL = 'sem-ot-anis@mail.ru'

type StoredDraft = {
  cart: Cart
  fields: RequestFields
}

const emptyFields: RequestFields = { name: '', contact: '', comment: '' }

function readStoredDraft(): StoredDraft {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { cart: {}, fields: emptyFields }
    const parsed = JSON.parse(raw) as Partial<StoredDraft>
    const knownNumbers = new Set(plants.map((plant) => String(plant.catalogNumber)))
    const cart = Object.fromEntries(
      Object.entries(parsed.cart ?? {})
        .filter(([number, quantity]) => knownNumbers.has(number) && Number.isFinite(quantity) && quantity > 0)
        .map(([number, quantity]) => [number, Math.min(99, Math.floor(quantity))]),
    )
    return {
      cart,
      fields: {
        name: typeof parsed.fields?.name === 'string' ? parsed.fields.name : '',
        contact: typeof parsed.fields?.contact === 'string' ? parsed.fields.contact : '',
        comment: typeof parsed.fields?.comment === 'string' ? parsed.fields.comment : '',
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

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <LeafIcon />
    </span>
  )
}

function App() {
  const initialDraft = useMemo(readStoredDraft, [])
  const [cart, setCart] = useState<Cart>(initialDraft.cart)
  const [fields, setFields] = useState<RequestFields>(initialDraft.fields)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | CategoryId>('all')
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const detailDialogRef = useRef<HTMLDialogElement>(null)
  const requestDialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, fields }))
  }, [cart, fields])

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
    const query = search.trim().toLocaleLowerCase('ru-RU').replace(/^№\s*/, '')
    return plants.filter((plant) => {
      const matchesCategory = category === 'all' || plant.category === category
      const haystack = `${plant.catalogNumber} ${plant.name} ${plant.latinName ?? ''}`.toLocaleLowerCase('ru-RU')
      return matchesCategory && (!query || haystack.includes(query))
    })
  }, [category, search])

  const cartLines = useMemo(() => getCartLines(cart, plants), [cart])
  const cartSummary = useMemo(() => getCartSummary(cartLines), [cartLines])
  const requestText = useMemo(() => buildRequestText(cartLines, fields), [cartLines, fields])
  const selectedPositions = cartLines.length
  const mailtoHref = `mailto:${NURSERY_EMAIL}?subject=${encodeURIComponent('Заявка с сайта питомника Анисимова')}&body=${encodeURIComponent(requestText)}`

  const addToCart = (plant: Plant) => {
    const key = String(plant.catalogNumber)
    setCart((current) => ({ ...current, [key]: Math.min(99, (current[key] ?? 0) + 1) }))
  }

  const setQuantity = (plantNumber: number, nextQuantity: number) => {
    const key = String(plantNumber)
    setCart((current) => {
      if (nextQuantity <= 0) {
        const next = { ...current }
        delete next[key]
        return next
      }
      return { ...current, [key]: Math.min(99, nextQuantity) }
    })
  }

  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(requestText)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = requestText
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.append(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setCopyStatus('Текст заявки скопирован')
    window.setTimeout(() => setCopyStatus(''), 2800)
  }

  const resetFilters = () => {
    setSearch('')
    setCategory('all')
  }

  return (
    <>
      <a className="skip-link" href="#main">Перейти к содержанию</a>

      <header className="site-header">
        <div className="header-inner container">
          <a className="brand" href="#top" aria-label="Питомник Анисимова — к началу страницы">
            <BrandMark />
            <span><strong>Питомник Анисимова</strong><small>Томск</small></span>
          </a>
          <nav className="main-nav" aria-label="Основная навигация">
            <a href="#catalog">Каталог</a>
            <a href="#order">Как заказать</a>
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
          <a href="#about">О питомнике</a>
          <a href="#contacts">Контакты</a>
        </nav>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="hero-inner container">
            <div className="hero-copy">
              <p className="eyebrow"><span /> Томск · питомник работает с 1991 года</p>
              <h1>Редкие растения для сада, выращенные с личным вниманием</h1>
              <p className="hero-lead">
                Семена, саженцы и луковицы из авторской коллекции Геннадия Павловича Анисимова — садовода с опытом более 40 лет.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#catalog">Посмотреть каталог <ArrowIcon /></a>
                <a className="text-link" href="#about">Познакомиться с питомником</a>
              </div>
              <dl className="hero-facts" aria-label="О демонстрационном каталоге">
                <div><dt>17</dt><dd>растений в демо</dd></div>
                <div><dt>4</dt><dd>раздела каталога</dd></div>
                <div><dt>1991</dt><dd>год начала рассылки</dd></div>
              </dl>
            </div>
            <figure className="hero-media">
              <img className="hero-photo-main" src="./images/trollius-asiaticus.jpg" alt="Оранжевые цветы купальницы азиатской из коллекции питомника" fetchPriority="high" />
              <div className="hero-photo-small">
                <img src="./images/campanula-latifolia.jpg" alt="Фиолетовый колокольчик широколистный из коллекции питомника" />
              </div>
              <figcaption><LeafIcon /> Авторские фотографии растений</figcaption>
            </figure>
          </div>
        </section>

        <div className="season-note-wrap container">
          <div className="season-note" role="note">
            <span className="season-note-icon" aria-hidden="true">i</span>
            <p><strong>Это демонстрационный каталог.</strong> Цены и сведения перенесены из каталога сезона 2025–2026, срок которого уже истёк. Наличие и условия нужно подтвердить у владельца до оплаты.</p>
          </div>
        </div>

        <section className="catalog-section section" id="catalog">
          <div className="container">
            <div className="section-heading catalog-heading">
              <div>
                <p className="section-kicker">Образец будущего каталога</p>
                <h2>Выберите растения</h2>
                <p>Поиск работает по названию и номеру из исходного каталога. Подробности и источник доступны в каждой карточке.</p>
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

            <div className="results-row" aria-live="polite">
              <p>Найдено: <strong>{filteredPlants.length}</strong></p>
              {(search || category !== 'all') && <button type="button" onClick={resetFilters}>Сбросить фильтры</button>}
            </div>

            {filteredPlants.length > 0 ? (
              <div className="plant-grid">
                {filteredPlants.map((plant) => {
                  const quantity = cart[String(plant.catalogNumber)] ?? 0
                  return (
                    <article className="plant-card" key={plant.catalogNumber}>
                      {plant.image ? (
                        <div className="plant-photo">
                          <img src={plant.image.src} alt={plant.image.alt} loading="lazy" decoding="async" />
                          <span>№ {plant.catalogNumber}</span>
                        </div>
                      ) : (
                        <div className="plant-photo plant-photo-empty">
                          <span>№ {plant.catalogNumber}</span>
                          <LeafIcon />
                          <small>Фото не опубликовано</small>
                        </div>
                      )}
                      <div className="plant-body">
                        <p className="plant-category">{categoryById[plant.category].shortLabel}</p>
                        <h3>{plant.name}</h3>
                        {plant.latinName && <p className="latin-name">{plant.latinName}</p>}
                        <p className="plant-description">{plant.description}</p>
                        <div className="plant-meta">
                          <p><span>Единица</span><strong>{plant.unit}</strong></p>
                          <p><span>Цена из каталога</span><strong>{plant.price === null ? 'Не указана' : formatRubles(plant.price)}</strong></p>
                        </div>
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
                <h3>Таких растений в демо-каталоге не найдено</h3>
                <p>Проверьте написание или посмотрите все 17 позиций. Полный каталог питомника значительно больше.</p>
                <button className="button button-primary" type="button" onClick={resetFilters}>Показать все растения</button>
              </div>
            )}
          </div>
        </section>

        <section className="order-section section" id="order">
          <div className="container">
            <div className="section-heading order-heading">
              <div>
                <p className="section-kicker light">Порядок с исходного сайта</p>
                <h2>Как оформить заказ</h2>
              </div>
              <p>Демоверсия помогает собрать номера позиций. Опубликованные правила оплаты и пересылки сохранены ниже без изменения порядка.</p>
            </div>

            <ol className="order-steps">
              <li><span>1</span><div><h3>Выберите номера</h3><p>Для одной единицы укажите только номер. Для нескольких — номер и количество через тире, например <strong>42-2</strong>.</p></div></li>
              <li><span>2</span><div><h3>Оформите заказ</h3><p>На исходном сайте просят полные Ф.И.О., почтовый адрес с индексом, номера позиций, сумму и дату оплаты, а также код постоянного заказчика.</p></div></li>
              <li><span>3</span><div><h3>Оплатите</h3><p>Заказы без оплаты или аванса не рассматриваются. По России указана полная оплата либо аванс: пересылка + не менее 30% стоимости товара.</p></div></li>
              <li><span>4</span><div><h3>Получите отправление</h3><p>Семена и саженцы отправляются отдельно. После отправки питомник сообщает почтовый идентификатор для отслеживания.</p></div></li>
            </ol>

            <div className="order-details">
              <article>
                <p className="detail-label">Пересылка по России</p>
                <h3>390 ₽ — семена<br />550 ₽ — посадочный материал</h3>
                <p>Опубликованные тарифы за отправление 1 класса. Если в заказе есть семена и саженцы, на исходном сайте указана оплата двух отправлений.</p>
              </article>
              <article>
                <p className="detail-label">Сроки</p>
                <h3>Семена — в течение недели после оплаты</h3>
                <p>Луковицы и саженцы отправляются в сроки, указанные у позиции. Для других стран — тарифы Почты России, предварительное согласование и полная предоплата.</p>
              </article>
              <aside>
                <strong>Перед реальным заказом</strong>
                <p>Уточните наличие, тарифы, способы оплаты и сезонные сроки у Геннадия Павловича. Банковские реквизиты намеренно не размещены в демоверсии.</p>
                <a href={`mailto:${NURSERY_EMAIL}`}>Написать на {NURSERY_EMAIL} <ArrowIcon /></a>
              </aside>
            </div>
          </div>
        </section>

        <section className="about-section section" id="about">
          <div className="container about-grid">
            <div className="about-visual">
              <div className="about-photo-frame">
                <img src="./images/gennady-anisimov.gif" alt="Геннадий Павлович Анисимов" loading="lazy" />
                <span>Авторское фото с исходного сайта</span>
              </div>
              <img className="about-plant-photo" src="./images/cephalaria-gigantea.jpg" alt="Головчатка гигантская в коллекции питомника" loading="lazy" />
            </div>
            <div className="about-copy">
              <p className="section-kicker">О питомнике</p>
              <h2>Коллекция, собранная садоводом</h2>
              <p className="about-lead">Геннадий Павлович более 40 лет занимается садоводством и собирает редкие растения. С 1991 года вместе с помощниками он отправляет выращенные в собственном питомнике семена, луковицы и саженцы.</p>
              <p>На исходном сайте коллекция описана как несколько сот редких растений. Там же опубликованы авторские материалы, основанные на личном опыте выращивания; статьи выходили более чем в пятидесяти журналах и газетах России.</p>
              <blockquote>«Индивидуальный подход — это наш конёк»</blockquote>
              <div className="about-points">
                <div><strong>Томск</strong><span>небольшой авторский питомник</span></div>
                <div><strong>С 1991 года</strong><span>рассылка посадочного материала</span></div>
                <div><strong>Ручная работа</strong><span>сбор и подготовка семян</span></div>
              </div>
              <a className="source-link" href="https://sem-ot-anis.narod.ru/index/0-59" target="_blank" rel="noreferrer">Открыть страницу «О нас» на исходном сайте <ArrowIcon /></a>
            </div>
          </div>
        </section>

        <section className="contacts-section" id="contacts">
          <div className="container contacts-grid">
            <div>
              <p className="section-kicker light">Связаться с питомником</p>
              <h2>Уточните наличие перед оплатой</h2>
              <p>Предпочтительный способ связи на исходном сайте — электронная почта. Эта демоверсия не отправляет данные на сервер.</p>
              <button className="button button-warm" type="button" onClick={() => setRequestOpen(true)}><BasketIcon /> Составить заявку</button>
            </div>
            <address className="contact-list">
              <a href={`mailto:${NURSERY_EMAIL}`}><span><MailIcon /></span><div><small>Электронная почта</small><strong>{NURSERY_EMAIL}</strong></div></a>
              <a href="tel:+79138518103"><span><PhoneIcon /></span><div><small>Мобильный телефон</small><strong>+7 913 851-81-03</strong></div></a>
              <a href="tel:+73822412436"><span><PhoneIcon /></span><div><small>Городской телефон</small><strong>+7 (3822) 41-24-36</strong></div></a>
              <div><span className="contact-letter">MAX</span><div><small>Мессенджер MAX</small><strong>+7 913 105-53-08</strong></div></div>
              <div><span className="contact-letter">а/я</span><div><small>Почтовый адрес</small><strong>634034, Россия, г. Томск, а/я 343</strong></div></div>
            </address>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <a className="brand footer-brand" href="#top"><BrandMark /><span><strong>Питомник Анисимова</strong><small>Демонстрационная версия обновления сайта</small></span></a>
          <p>Контент перенесён с исходного сайта без рекламных скриптов и сторонних счётчиков.</p>
          <a href="https://sem-ot-anis.narod.ru/" target="_blank" rel="noreferrer">Исходный сайт <ArrowIcon /></a>
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
              <p className="outdated-note">Цена и наличие требуют подтверждения: опубликованный сезон завершён.</p>
              <div className="detail-actions">
                <button className="button button-primary" type="button" onClick={() => addToCart(selectedPlant)}><PlusIcon /> Добавить в заявку{cart[String(selectedPlant.catalogNumber)] ? ` · ${cart[String(selectedPlant.catalogNumber)]}` : ''}</button>
                <a href={selectedPlant.sourceUrl} target="_blank" rel="noreferrer">Источник описания <ArrowIcon /></a>
              </div>
            </div>
          </div>
        )}
      </dialog>

      <dialog className="request-dialog" ref={requestDialogRef} onClose={() => setRequestOpen(false)} aria-labelledby="request-title">
        <div className="request-shell">
          <header className="request-header">
            <div><p className="section-kicker">Черновик письма</p><h2 id="request-title">Моя заявка</h2><p>{selectedPositions} позиций · {cartSummary.unitsCount} единиц</p></div>
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
                          <p>{plant.unit} · {plant.price === null ? 'цена не указана' : formatRubles(plant.price)}</p>
                          <div className="cart-line-controls">
                            <div className="quantity-control" aria-label={`Количество: ${plant.name}`}>
                              <button type="button" onClick={() => setQuantity(plant.catalogNumber, quantity - 1)} aria-label="Уменьшить количество"><MinusIcon /></button>
                              <output aria-live="polite">{quantity}</output>
                              <button type="button" onClick={() => setQuantity(plant.catalogNumber, quantity + 1)} aria-label="Увеличить количество"><PlusIcon /></button>
                            </div>
                            <button className="remove-button" type="button" onClick={() => setQuantity(plant.catalogNumber, 0)}>Удалить</button>
                          </div>
                        </div>
                        <strong className="cart-line-total">{plant.price === null ? '—' : formatRubles(plant.price * quantity)}</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="cart-summary">
                    <span>Стоимость позиций</span><strong>{formatRubles(cartSummary.knownTotal)}</strong>
                    <p>Без доставки. Наличие, цены и тарифы нужно подтвердить.</p>
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
              <div className="request-form-heading"><h3>Контакты для ответа</h3><p>Поля остаются только в вашем браузере, пока вы сами не откроете письмо.</p></div>
              <label><span>Ваше имя</span><input type="text" value={fields.name} onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))} placeholder="Например, Ирина" autoComplete="name" /></label>
              <label><span>Телефон или электронная почта</span><input type="text" value={fields.contact} onChange={(event) => setFields((current) => ({ ...current, contact: event.target.value }))} placeholder="Куда удобно ответить" /></label>
              <label><span>Комментарий <small>необязательно</small></span><textarea value={fields.comment} onChange={(event) => setFields((current) => ({ ...current, comment: event.target.value }))} placeholder="Город доставки, вопросы по срокам или растениям" rows={4} /></label>

              <details className="request-preview">
                <summary>Посмотреть текст заявки</summary>
                <pre>{requestText}</pre>
              </details>

              <div className="request-actions">
                <button className="button button-outline" type="button" onClick={copyRequest} disabled={!cartLines.length}><CopyIcon /> {copyStatus || 'Скопировать заявку'}</button>
                <a className={`button button-primary ${cartLines.length ? '' : 'disabled'}`} href={cartLines.length ? mailtoHref : undefined} aria-disabled={!cartLines.length}><MailIcon /> Открыть письмо</a>
              </div>
              <p className="mail-explanation">Откроется почтовое приложение с готовым текстом. Проверьте письмо и нажмите «Отправить» самостоятельно — сайт не сообщает об отправке, пока её действительно не было.</p>
              <p className="copy-live" aria-live="polite">{copyStatus}</p>
            </section>
          </div>
        </div>
      </dialog>
    </>
  )
}

export default App
