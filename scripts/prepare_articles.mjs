import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const index = []
const slugs = new Set()
const versionPairs = {
  'archive-02-alfrediya-ponikshaya': 'zagadochnaya-alfrediya',
  'archive-22-bezvremennik': 'bezvremennik',
  'archive-11-kandyk-sibirskiy': 'kandyk-sibirskiy',
  'archive-26-kupalnitsa-aziatskaya': 'kupalnitsa-aziatskaya',
  'archive-19-sibirskaya-cheremsha': 'sibirskaya-cheremsha',
}
const output = path.join(root, 'public/articles/content')
await mkdir(output, { recursive: true })

const uploaded = JSON.parse(await readFile(path.join(root, 'src/data/new-articles.json'), 'utf8'))
const archived = JSON.parse(await readFile(path.join(root, 'src/data/archive-articles.json'), 'utf8'))
for (const [older, current] of Object.entries(versionPairs)) {
  if (!archived.some((item) => item.slug === older) || !uploaded.some((item) => item.slug === current)) throw new Error(`Cannot resolve duplicate article: ${older}`)
}
const source = archived.map((item) => {
  const replacement = uploaded.find((article) => article.slug === versionPairs[item.slug])
  return replacement ? { ...replacement, sourceUrl: item.sourceUrl, featured: true, origin: 'archive' } : { ...item, origin: 'archive' }
})
for (const item of uploaded) {
  if (!source.some((article) => article.slug === item.slug)) source.push({ ...item, featured: true })
}
source.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
for (const item of source) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || slugs.has(item.slug)) throw new Error(`Invalid or duplicate article slug: ${item.slug}`)
    if (!item.title?.trim() || !item.blocks?.length) throw new Error(`Empty article: ${item.slug}`)
    slugs.add(item.slug)
    const words = item.blocks.flatMap((block) => block.items ?? [block.text ?? '']).join(' ').split(/\s+/).filter(Boolean).length
    const contentStatus = item.contentStatus === 'excerpt' || item.status === 'excerpt' ? 'excerpt' : 'full'
    const { blocks, ...metadata } = item
    const article = {
      ...metadata,
      contentStatus,
      author: item.author || 'Геннадий Павлович Анисимов',
      plantNumbers: item.plantNumbers ?? [],
      readingMinutes: Math.max(1, Math.ceil(words / 180)),
      contentUrl: `./articles/content/${item.slug}.json`,
    }
    index.push(article)
    await writeFile(path.join(output, `${item.slug}.json`), JSON.stringify({ ...article, blocks }) + '\n')
}

for (const name of await readdir(output)) {
  if (name.endsWith('.json') && !slugs.has(name.slice(0, -5))) await unlink(path.join(output, name))
}
const downloads = new Set(source.map((item) => item.downloadUrl).filter(Boolean).map((url) => path.basename(url)))
for (const name of await readdir(path.join(root, 'public/articles/originals'))) {
  if (name.startsWith('archive-') && name.endsWith('.doc') && !downloads.has(name)) await unlink(path.join(root, 'public/articles/originals', name))
}
await writeFile(path.join(root, 'src/data/article-index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`Articles prepared: ${index.length} unique publications; uploaded copies replace matching archive entries`)
