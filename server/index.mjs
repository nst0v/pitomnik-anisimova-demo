import { createServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAdminHandler, sendJson } from './auth.mjs'
import { createContentHandler } from './content.mjs'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.doc': 'application/msword',
  '.dot': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function createSiteServer(options = {}) {
  const root = resolve(options.root ?? fileURLToPath(new URL('../dist', import.meta.url)))
  const auth = createAdminHandler(options)
  const content = createContentHandler({ dataDirectory: options.dataDirectory ?? process.env.ADMIN_DATA_DIR ?? '.admin-data' })
  const server = createServer(async (request, response) => {
    try {
      if (await auth(request, response)) return
      const session = auth.getSession(request)
      if (await content(request, response, { authenticated: session !== null, csrfToken: session?.csrfToken })) return
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        request.resume()
        sendJson(response, 405, { error: 'Этот способ запроса не поддерживается.' }, { Allow: 'GET, HEAD' })
        return
      }
      let path
      try { path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname) } catch {
        sendJson(response, 400, { error: 'Некорректный адрес.' })
        return
      }
      if (path.includes('\0') || path.includes('\\')) {
        sendJson(response, 400, { error: 'Некорректный адрес.' })
        return
      }
      const adminPage = path === '/admin' || path === '/admin/'
      const relativePath = path === '/' || adminPage ? '/index.html' : path
      const absolutePath = resolve(root, `.${relativePath}`)
      if (!absolutePath.startsWith(`${root}${sep}`)) {
        sendJson(response, 403, { error: 'Доступ запрещён.' })
        return
      }
      const [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(absolutePath)])
      if (!canonicalFile.startsWith(`${canonicalRoot}${sep}`)) {
        sendJson(response, 403, { error: 'Доступ запрещён.' })
        return
      }
      const file = await stat(absolutePath)
      if (!file.isFile()) {
        sendJson(response, 404, { error: 'Страница не найдена.' })
        return
      }
      const bytes = await readFile(absolutePath)
      // A literal base also guides the browser's speculative preload scanner.
      const body = adminPage ? Buffer.from(bytes.toString('utf8').replace('<head>', '<head><base href="/">')) : bytes
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(absolutePath).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': relativePath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        ...(adminPage ? { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } : {}),
      })
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch (error) {
      if (!response.headersSent) sendJson(response, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, { error: error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'Страница не найдена.' : 'Не удалось выполнить запрос.' })
      else response.destroy()
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') console.error(error)
    }
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000)
  const host = process.env.HOST ?? '127.0.0.1'
  const server = createSiteServer({ secureCookies: process.env.ADMIN_SECURE_COOKIES === 'true' ? true : undefined })
  server.on('error', (error) => {
    console.error('Не удалось запустить сайт:', error.message)
    process.exitCode = 1
  })
  server.listen(port, host, () => console.log(`Сайт и кабинет администратора: http://${host}:${port}/admin`))
}
