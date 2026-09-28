import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { InstallPage } from './components/InstallPage'

const isInstall = window.location.pathname.replace(/\/$/, '') === '/install'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isInstall ? <InstallPage /> : <App />}
  </StrictMode>,
)
