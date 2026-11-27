import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './articles.css'
import { loadSiteContent } from './lib/site-content'

const Admin = lazy(() => import('./components/Admin'))
const isAdmin = /\/admin\/?$/.test(window.location.pathname) || /^#\/admin\/?$/.test(window.location.hash)

async function start() {
  await loadSiteContent()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {isAdmin
        ? <Suspense fallback={<main className="container section" role="status">Открываем кабинет…</main>}><Admin /></Suspense>
        : <App />}
    </StrictMode>,
  )
}

void start()
