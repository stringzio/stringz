import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// Deploys replace every hashed chunk atomically (Cloud Run serves only the
// new image). A session open across a deploy lazy-loads chunk names the new
// image no longer has; the SPA fallback answers text/html, the import fails,
// and without this the screen just goes blank until a manual refresh. Vite
// surfaces a failed dynamic import as vite:preloadError - reload once to
// pick up the fresh index.html.
window.addEventListener('vite:preloadError', () => window.location.reload())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
