// Top-level component. Manages which page is currently shown
// and renders the navigation bar at the top.

import { useState, useEffect } from 'react'
import NavBar from './components/NavBar'
import LandingPage from './pages/LandingPage'
import SetupPage from './pages/SetupPage'
import DocsPage from './pages/DocsPage'
import CreateVmPage from './pages/CreateVmPage'
import LogsPage from './pages/LogsPage'
import ErrorBoundary from './ErrorBoundary'

// All valid page names in the app
export type Page = 'landing' | 'setup' | 'create-vm' | 'docs' | 'logs'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [isDev, setIsDev] = useState(false)

  useEffect(() => {
    window.electronAPI.isDev().then(setIsDev)
  }, [])

  return (
    <div className="flex flex-col h-screen">
      {/* Navigation bar — always visible at the top */}
      <NavBar currentPage={currentPage} onNavigate={setCurrentPage} isDev={isDev} />

      {/* Main content area — scrollable */}
      <main className="flex-1 overflow-y-auto p-6">
        <ErrorBoundary>
          {currentPage === 'landing' && <LandingPage onNavigate={setCurrentPage} />}
          {/* SetupPage and CreateVmPage stay mounted so their state survives navigation */}
          <div style={{ display: currentPage === 'setup' ? undefined : 'none' }} className="h-full overflow-hidden">
            <SetupPage />
          </div>
          <div style={{ display: currentPage === 'create-vm' ? undefined : 'none' }} className="h-full overflow-hidden">
            <CreateVmPage />
          </div>
          {currentPage === 'docs' && <DocsPage />}
          {currentPage === 'logs' && <LogsPage />}
        </ErrorBoundary>
      </main>
    </div>
  )
}
