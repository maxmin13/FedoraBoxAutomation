// Top-level component. Manages which page is currently shown
// and renders the navigation bar at the top.

import { useState, useEffect, useRef, useCallback } from 'react'
import NavBar from './components/NavBar'
import LandingPage from './pages/LandingPage'
import SetupPage from './pages/SetupPage'
import DocsPage from './pages/DocsPage'
import CreateVmPage from './pages/CreateVmPage'
import LogsPage from './pages/LogsPage'
import ErrorBoundary from './ErrorBoundary'
import VmLoginPage from './pages/VmLoginPage'

// All valid page names in the app
export type Page = 'landing' | 'setup' | 'create-vm' | 'docs' | 'logs' | 'vm-login'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [landingKey, setLandingKey] = useState(0)
  const [createVmNavKey, setCreateVmNavKey] = useState(0)
  const [scriptRunning, setScriptRunning] = useState(false)
  const [scriptPage, setScriptPage] = useState<Page | null>(null)
  // Set to true when a script that ran from 'landing' finishes while the user
  // is on another page.  The next navigation to 'landing' will skip the key
  // increment so the provision result stays visible; the one after that resets.
  const [preserveLanding, setPreserveLanding] = useState(false)

  const currentPageRef = useRef(currentPage)
  useEffect(() => { currentPageRef.current = currentPage }, [currentPage])

  const scriptPageRef = useRef<Page | null>(null)

  const handleScriptRunning = useCallback((running: boolean) => {
    if (running) {
      const page = currentPageRef.current
      scriptPageRef.current = page
      setScriptRunning(true)
      setScriptPage(page)
      setPreserveLanding(false)
    } else {
      if (scriptPageRef.current === 'landing' && currentPageRef.current !== 'landing') {
        setPreserveLanding(true)
      }
      scriptPageRef.current = null
      setScriptRunning(false)
      setScriptPage(null)
    }
  }, [])

  function handleNavigate(page: Page) {
    if (page === 'create-vm') setCreateVmNavKey((k) => k + 1)
    if (page === 'landing') {
      if (preserveLanding) {
        // First return after script — show result, consume the flag
        setPreserveLanding(false)
      } else if (!scriptRunning) {
        // Normal navigation — reset landing to VM grid
        setLandingKey((k) => k + 1)
      }
    }
    setCurrentPage(page)
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Navigation bar — always visible at the top */}
      <NavBar currentPage={currentPage} onNavigate={handleNavigate} />

      {/* Main content area — scrollable */}
      <main className="flex-1 overflow-hidden p-6">
        <ErrorBoundary>
          <div style={{ display: currentPage === 'landing' ? undefined : 'none' }} className="h-full overflow-hidden">
            <LandingPage key={landingKey} onNavigate={handleNavigate} onScriptRunning={handleScriptRunning} isActive={currentPage === 'landing'} createVmRunning={scriptRunning && scriptPage === 'create-vm'} />
          </div>
          {/* SetupPage and CreateVmPage stay mounted so their state survives navigation */}
          <div style={{ display: currentPage === 'setup' ? undefined : 'none' }} className="h-full overflow-hidden">
            <SetupPage onScriptRunning={handleScriptRunning} />
          </div>
          <div style={{ display: currentPage === 'create-vm' ? undefined : 'none' }} className="h-full overflow-hidden">
            <CreateVmPage onScriptRunning={handleScriptRunning} onNavigate={handleNavigate} navKey={createVmNavKey} />
          </div>
          {currentPage === 'docs' && (
            <div className="h-full overflow-hidden">
              <DocsPage />
            </div>
          )}
          <div style={{ display: currentPage === 'logs' ? undefined : 'none' }} className="h-full overflow-hidden">
            <LogsPage isActive={currentPage === 'logs'} />
          </div>
          {currentPage === 'vm-login' && (
            <div className="h-full overflow-hidden">
              <VmLoginPage onNavigate={handleNavigate} />
            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
