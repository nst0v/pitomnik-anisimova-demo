export type CategoryId = 'annuals' | 'perennials' | 'useful' | 'planting'

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
  price: number | null
  sourceUrl: string
  image?: PlantImage
  note?: string
  priceNote?: string
  shippingNote?: string
}

export const categories: Array<{ id: CategoryId; label: string; shortLabel: string }> = [
  { id: 'annuals', label: 'Цветы — однолетники', shortLabel: 'Однолетники' },
  { id: 'perennials', label: 'Многолетники и декоративные', shortLabel: 'Многолетники' },
  { id: 'useful', label: 'Лекарственные, пряные и овощные', shortLabel: 'Полезные растения' },
  { id: 'planting', label: 'Саженцы, луковицы и клубни', shortLabel: 'Саженцы и луковицы' },
]

const photoSource = 'https://sem-ot-anis.narod.ru/index/0-73'

export const plants: Plant[] = [
  {
    catalogNumber: 1,
    name: 'Мак пионовидный',
    latinName: 'Papaver plena',
    category: 'annuals',
    description:
      'Декоративный (не опиумный) мак с махровыми цветками диаметром до 15 см. Смесь: розовые, сиреневые, белые, красные, жёлтые.',
    unit: 'Пакет, 50 семян',
    price: 50,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-61',
    image: {
      src: './images/papaver-paeoniflorum.webp',
      alt: "Махровый красный цветок пионовидного мака",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Giant_Double_Red_Peony_Poppy_-_Flickr_-_Swallowtail_Garden_Seeds.jpg",
      attribution: {
        author: "Swallowtail Garden Seeds",
        license: "CC BY 2.0",
        licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      },
    },
  },
  {
    catalogNumber: 3,
    name: 'Фацелия',
    latinName: 'Phacelia thanacetifolia',
    category: 'annuals',
    description:
      'Сиреневые цветки в разветвлённых колосовидных соцветиях источают аромат всё лето. Медонос и сидерат, обогащающий почву азотом и очищающий её от грибковой инфекции.',
    unit: 'Пакет, 100 семян',
    price: 40,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-61',
    image: {
      src: './images/phacelia-tanacetifolia.webp',
      alt: "Сиреневые соцветия фацелии пижмолистной",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:IMG_7406-Phacelia_tanacetifolia.jpg",
      attribution: {
        author: "C T Johansson",
        license: "CC BY 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by/3.0",
      },
    },
  },
  {
    catalogNumber: 5,
    name: 'Цефалофора ароматная',
    latinName: 'Cephalophora aromatica',
    category: 'annuals',
    description:
      'Земляничная трава. Редкий сухоцвет с ярко-жёлтыми шаровидными соцветиями диаметром 1–1,5 см на прочных цветоносах длиной около 40 см. Обладает сильным приятным ароматом.',
    unit: 'Пакет, 30 семян',
    price: 60,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-61',
    image: {
      src: './images/cephalophora-aromatica.webp',
      alt: "Жёлтые шаровидные соцветия цефалофоры ароматной",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cephalophora_aromatica.jpg",
      attribution: {
        author: "Ettrig",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      },
    },
    note: 'На исходном сайте: количество ограничено, наличие нужно уточнять.',
  },
  {
    catalogNumber: 6,
    name: 'Шпинат земляничный',
    latinName: 'Chenopodium foliosum',
    category: 'annuals',
    description:
      'Холодостойкий и неприхотливый однолетник со съедобными листьями и красными ягодами. Скороспел: при посеве в грунт в начале мая урожай на исходном сайте указан с середины июля до сентября.',
    unit: 'Пакет, 50 семян',
    price: 50,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-61',
    image: {
      src: './images/chenopodium-foliosum.webp',
      alt: "Стебли земляничного шпината с красными соплодиями",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Chenopodium_foliosum_sl18.jpg",
      attribution: {
        author: "Stefan.lefnaer",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      },
    },
  },
  {
    catalogNumber: 7,
    name: 'Аквилегия длинношпорцевая гибридная',
    latinName: 'Aquilegia hybrida',
    category: 'perennials',
    description:
      'Крупные двухцветные цветки сочетают жёлтые, голубые, лиловые, вишнёвые и другие тона. На исходном сайте названа одной из самых элегантных аквилегий.',
    unit: 'Пакет, 50 семян',
    price: 40,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-62',
    image: {
      src: './images/aquilegia-hybrida.webp',
      alt: "Двухцветные цветки гибридной аквилегии с длинными шпорцами",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Aquilegia_x_hybrida_a4.jpg",
      attribution: {
        author: "Jerzy Opioła",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      },
    },
  },
  {
    catalogNumber: 19,
    name: 'Головчатка гигантская',
    latinName: 'Cephalaria gigantea',
    category: 'perennials',
    description:
      'Неприхотливый зимостойкий многолетник высотой до 2,5 м. Крупные лимонно-жёлтые соцветия ароматных цветков на тонких прочных цветоносах словно парят в воздухе.',
    unit: 'Пакет, 10 крупных семян',
    price: 50,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-62',
    image: {
      src: './images/cephalaria-gigantea.jpg',
      alt: 'Лимонно-жёлтые соцветия головчатки гигантской в питомнике',
      sourceUrl: photoSource,
    },
  },
  {
    catalogNumber: 25,
    name: 'Зверобой большой',
    latinName: 'Hypericum ascyron',
    category: 'perennials',
    description:
      'Многолетнее травянистое растение высотой до 1 м с крупными цветками диаметром до 8 см. Редкий зимостойкий и неприхотливый вид.',
    unit: 'Пакет, 50 семян',
    price: 40,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-62',
    image: {
      src: './images/hypericum-ascyron.jpg',
      alt: 'Крупный жёлтый цветок зверобоя большого',
      sourceUrl: photoSource,
    },
  },
  {
    catalogNumber: 39,
    name: 'Колокольчик широколистный',
    latinName: 'Campanula latifolia',
    category: 'perennials',
    description:
      'Очень крупные, до 6 см длиной, фиолетовые и белые цветки собраны в длинные соцветия на цветоносах высотой до 1 м.',
    unit: 'Пакет, 100 семян',
    price: 40,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-62',
    image: {
      src: './images/campanula-latifolia.jpg',
      alt: 'Фиолетовые цветки колокольчика широколистного',
      sourceUrl: photoSource,
    },
  },
  {
    catalogNumber: 42,
    name: 'Купальница азиатская',
    latinName: 'Trollius asiaticus',
    category: 'perennials',
    description:
      'Также известна как «Огоньки» или «Жарки». Эффектно отличается от купальницы европейской ярко-оранжевой, пылающей окраской цветков.',
    unit: 'Пакет, 50 семян',
    price: 80,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-62',
    image: {
      src: './images/trollius-asiaticus.jpg',
      alt: 'Ярко-оранжевые цветки купальницы азиатской',
      sourceUrl: photoSource,
    },
    note: 'Саженцы этого растения в исходном каталоге указаны отдельно под № 192.',
  },
  {
    catalogNumber: 92,
    name: 'Вербена лекарственная',
    latinName: 'Verbena officinalis',
    category: 'useful',
    description:
      'Зимостойкое многолетнее травянистое растение высотой до 70 см с прямым ветвистым стеблем и колосовидными соцветиями лиловых цветков.',
    unit: 'Пакет, 50 семян',
    price: 60,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-64',
    image: {
      src: './images/verbena-officinalis.jpg',
      alt: 'Лиловые соцветия вербены лекарственной',
      sourceUrl: photoSource,
    },
  },
  {
    catalogNumber: 96,
    name: 'Голубика обыкновенная',
    latinName: 'Vaccinium uliginosum',
    category: 'useful',
    description:
      'Зимостойкий долговечный ягодный кустарник высотой около 1 м. На исходном сайте указано, что хорошо растёт в саду на обычной почве с добавлением торфа.',
    unit: 'Пакет, 50 семян',
    price: 50,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-64',
    image: {
      src: './images/vaccinium-uliginosum.webp',
      alt: "Спелые ягоды голубики обыкновенной",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Vaccinium_uliginosum_berries.jpg",
      attribution: {
        author: "Wkee4ager",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      },
    },
  },
  {
    catalogNumber: 109,
    name: 'Змееголовник молдавский',
    latinName: 'Dracocephalum moldavica',
    category: 'useful',
    description:
      'Однолетнее растение высотой около 60 см. Надземная часть обладает мятно-лимонным ароматом; свежую и сушёную траву используют для чая, при засолке овощей и как ароматную добавку. Медонос.',
    unit: 'Пакет, 50 семян',
    price: 40,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-64',
    image: {
      src: './images/dracocephalum-moldavica.jpg',
      alt: 'Синие цветки змееголовника молдавского',
      sourceUrl: photoSource,
    },
  },
  {
    catalogNumber: 118,
    name: 'Козлятник (галега восточная)',
    latinName: 'Galega orientalis',
    category: 'useful',
    description:
      'Зимостойкий многолетник высотой до 1,5 м. Образует мощный куст из прямостоячих ветвистых стеблей; сине-фиолетовые цветки собраны в рыхлые кисти длиной до 30 см.',
    unit: 'Пакет, 30 семян',
    price: 40,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-64',
    image: {
      src: './images/galega-orientalis.webp',
      alt: "Фиолетовые соцветия галеги восточной",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Galega_orientalis_2.jpg",
      attribution: {
        author: "Franz Xaver",
        license: "CC BY-SA 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      },
    },
    note: 'Саженцы этого растения в исходном каталоге указаны отдельно под № 191.',
  },
  {
    catalogNumber: 125,
    name: 'Лофант анисовый',
    latinName: 'Lophanthus anisatus',
    category: 'useful',
    description:
      'Многолетник высотой около 80 см. Цветки и листья обладают сильным приятным ароматом; на исходном сайте растение предложено как пряность для чая, соусов, маринадов и напитков.',
    unit: 'Пакет, 50 семян',
    price: 40,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-77',
    image: {
      src: './images/agastache-foeniculum.webp',
      alt: "Сиреневые соцветия лофанта анисового",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Agastache_foeniculum01.jpg",
      attribution: {
        author: "Meneerke bloem",
        license: "CC BY-SA 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      },
    },
  },
  {
    catalogNumber: 140,
    name: 'Овсяный корень',
    latinName: 'Tragopogon porrifolius',
    category: 'useful',
    description:
      'Также называется «Огородная устрица». Даёт крупные корнеплоды, которые хорошо хранятся в погребе и зимуют в почве; используются в супах, гарнирах и как самостоятельное овощное блюдо.',
    unit: 'Пакет, 20 семян',
    price: 40,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-77',
    image: {
      src: './images/tragopogon-porrifolius.webp',
      alt: "Фиолетовый цветок овсяного корня",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Tragopogon_porrifolius_1_MHNT.jpg",
      attribution: {
        author: "Roger Culos",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      },
    },
  },
  {
    catalogNumber: 176,
    name: 'Бадан толстолистный',
    latinName: 'Bergénia crassifólia',
    category: 'planting',
    description:
      'Корневищный многолетник с зимующими листьями, цветущий в мае. Очень зимостоек и теневынослив.',
    unit: '1 саженец',
    price: 390,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-65',
    image: {
      src: './images/bergenia-crassifolia.jpg',
      alt: 'Розовые соцветия бадана толстолистного',
      sourceUrl: photoSource,
    },
    shippingNote: 'На исходном сайте рассылка указана в мае и августе–сентябре.',
  },
  {
    catalogNumber: 189,
    name: 'Кедр сибирский',
    latinName: 'Pinus sibirica',
    category: 'planting',
    description:
      'Хвойное дерево с тёмной густой хвоей длиной до 12 см. Посевные орехи в исходном каталоге указаны отдельно под № 28.',
    unit: '1 саженец',
    price: 390,
    sourceUrl: 'https://sem-ot-anis.narod.ru/index/0-65',
    image: {
      src: './images/pinus-sibirica.jpg',
      alt: 'Молодой кедр сибирский с густой хвоей',
      sourceUrl: photoSource,
    },
    priceNote: 'При заказе от 3 саженцев на исходном сайте указана цена 350 ₽ за штуку.',
    shippingNote: 'На исходном сайте рассылка указана в мае и августе–сентябре.',
  },
]

export const categoryById = Object.fromEntries(categories.map((category) => [category.id, category])) as Record<
  CategoryId,
  (typeof categories)[number]
>
