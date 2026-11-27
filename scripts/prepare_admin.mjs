import { mkdir, readFile, writeFile } from 'node:fs/promises'

// A real directory makes /admin/ open on static hosts such as GitHub Pages.
// A literal base also covers the browser's preload scanner, which can run
// before the inline routing script in the main page.
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
await mkdir(new URL('../dist/admin/', import.meta.url), { recursive: true })
await writeFile(new URL('../dist/admin/index.html', import.meta.url), html.replace('<head>', '<head><base href="../">'))
