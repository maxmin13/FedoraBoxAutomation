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
  const [createVmNavKey, setCreateVmNavKey] = useState(0)
  const [landingNavKey,  setLandingNavKey]  = useState(0)
  const [scriptRunning, setScriptRunning] = useState(false)
  const [scriptPage, setScriptPage] = useState<Page | null>(null)
  const [showCloseWarning, setShowCloseWarning] = useState(false)

  useEffect(() => {
    return window.electronAPI.onCloseWarning(() => setShowCloseWarning(true))
  }, [])

  const currentPageRef = useRef(currentPage)
  useEffect(() => { currentPageRef.current = currentPage }, [currentPage])

  const handleScriptRunning = useCallback((running: boolean) => {
    if (running) {
      setScriptRunning(true)
      setScriptPage(currentPageRef.current)
    } else {
      setScriptRunning(false)
      setScriptPage(null)
    }
  }, [])

  function handleNavigate(page: Page) {
    if (page === 'create-vm') setCreateVmNavKey((k) => k + 1)
    if (page === 'landing')   setLandingNavKey((k) => k + 1)
    setCurrentPage(page)
  }

  return (
    <div className="flex flex-col h-screen">

      {showCloseWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl space-y-4">
            <h2 className="text-zinc-100 font-semibold">Script still running</h2>
            <p className="text-zinc-300 text-sm">
              A script is still running. Force quitting now may leave your VM in an incomplete state.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowCloseWarning(false); window.electronAPI.respondToCloseWarning(false) }}
                className="px-4 py-2 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
              >
                Keep waiting
              </button>
              <button
                onClick={() => window.electronAPI.respondToCloseWarning(true)}
                className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white font-medium rounded transition-colors"
              >
                Force quit
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Navigation bar — always visible at the top */}
      <NavBar currentPage={currentPage} onNavigate={handleNavigate} />

      {/* Main content area — scrollable */}
      <main className="flex-1 overflow-hidden p-6">
        <ErrorBoundary>
          <div style={{ display: currentPage === 'landing' ? undefined : 'none' }} className="h-full overflow-hidden">
            <LandingPage onNavigate={handleNavigate} onScriptRunning={handleScriptRunning} isActive={currentPage === 'landing'} createVmRunning={scriptRunning && scriptPage === 'create-vm'} navKey={landingNavKey} />
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
