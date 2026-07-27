import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { Landing } from './Landing.tsx'
import { DashboardPage } from './DashboardPage.tsx'
import { HistoryPage } from './HistoryPage.tsx'
import { DevMode } from './DevMode.tsx'
import { ProfilePage } from './ProfilePage.tsx'
import { DocsPage } from './DocsPage.tsx'
import { initKeycloak } from './keycloak'

// Initialise Keycloak (détecte une session existante) avant de rendre l'app.
initKeycloak().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/audit" element={<App />} />
          <Route path="/dev" element={<DevMode />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/docs" element={<DocsPage />} />
        </Routes>
      </BrowserRouter>
    </StrictMode>,
  )
})
