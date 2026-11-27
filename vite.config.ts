import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createAdminHandler } from './server/auth.mjs'
import { createContentHandler } from './server/content.mjs'
import type { Plugin, ViteDevServer } from 'vite'

function adminBackend(): Plugin {
  const mount = (server: Pick<ViteDevServer, 'middlewares'>) => {
    const auth = createAdminHandler()
    const content = createContentHandler({ dataDirectory: process.env.ADMIN_DATA_DIR ?? '.admin-data' })
    server.middlewares.use((request, response, next) => {
      void (async () => {
        if (await auth(request, response)) return
        const session = auth.getSession(request)
        if (await content(request, response, { authenticated: Boolean(session), csrfToken: session?.csrfToken })) return
        next()
      })().catch(next)
    })
  }
  return { name: 'nursery-admin-backend', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig({
  base: './',
  plugins: [react(), adminBackend()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules/ },
            { name: 'catalog-data', test: /src\/data\/(catalog-2027\.json|plant-images\.ts)/ },
          ],
        },
      },
    },
  },
})
