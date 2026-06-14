import { useState } from 'react'

/**
 * Silent credential check before any action that requires a running VM.
 * If credentials are missing or the connection test fails, sets loginRequired = true
 * so the caller can show VmLoginPage. When loginRequired is false again (after login
 * or back), the user re-clicks and the action proceeds with fresh credentials.
 */
export function useAuthGate(vmName: string) {
  const [loginRequired, setLoginRequired] = useState(false)

  async function withAuth(action: () => void) {
    const creds = await window.electronAPI.loadVmCredentials(vmName)
    if (!creds.ok || !creds.user || !creds.pass) {
      setLoginRequired(true)
      return
    }
    const check = await window.electronAPI.checkVmCredentials(vmName, creds.user, creds.pass)
    if (!check.ok) {
      setLoginRequired(true)
      return
    }
    action()
  }

  return {
    withAuth,
    loginRequired,
    onLoginSuccess: () => setLoginRequired(false),
    onLoginBack:    () => setLoginRequired(false),
  }
}
