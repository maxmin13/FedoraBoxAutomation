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
  const [landingKey, setLandingKey] = useState(0)
  const [isDev, setIsDev] = useState(false)
  const [scriptRunning, setScriptRunning] = useState(false)
  const [scriptPage, setScriptPage] = useState<Page | null>(null)

  useEffect(() => {
    window.electronAPI.isDev().then(setIsDev)
  }, [])

  function handleScriptRunning(running: boolean) {
    setScriptRunning(running)
    if (running) setScriptPage(currentPage)
    else setScriptPage(null)
  }

  function handleNavigate(page: Page) {
    if (page === 'landing' && currentPage === 'landing') {
      setLandingKey((k) => k + 1)
    }
    setCurrentPage(page)
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Navigation bar — always visible at the top */}
      <NavBar currentPage={currentPage} onNavigate={handleNavigate} isDev={isDev} scriptRunning={scriptRunning} scriptPage={scriptPage} />

      {/* Main content area — scrollable */}
      <main className="flex-1 overflow-y-auto p-6">
        <ErrorBoundary>
          <div style={{ display: currentPage === 'landing' ? undefined : 'none' }}>
            <LandingPage key={landingKey} onNavigate={handleNavigate} onScriptRunning={handleScriptRunning} />
          </div>
          {/* SetupPage and CreateVmPage stay mounted so their state survives navigation */}
          <div style={{ display: currentPage === 'setup' ? undefined : 'none' }} className="h-full overflow-hidden">
            <SetupPage onScriptRunning={handleScriptRunning} />
          </div>
          <div style={{ display: currentPage === 'create-vm' ? undefined : 'none' }} className="h-full overflow-hidden">
            <CreateVmPage onScriptRunning={handleScriptRunning} />
          </div>
          {currentPage === 'docs' && <DocsPage />}
          <div style={{ display: currentPage === 'logs' ? undefined : 'none' }} className="h-full overflow-hidden">
            <LogsPage />
          </div>
        </ErrorBoundary>
      </main>
    </div>
  )
}
