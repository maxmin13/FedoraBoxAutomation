// Type definitions for the API exposed by preload.js via contextBridge.
// This file tells TypeScript what window.electronAPI looks like
// so you get autocomplete and type checking in all React components.

export interface CheckResult {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export interface Vm {
  name: string
  uuid: string
  running: boolean
}

export interface ScriptLine {
  text: string
  source: 'stdout' | 'stderr'
}

declare global {
  interface Window {
    electronAPI: {
      listVms: () => Promise<{ ok: boolean; vms: Vm[]; error?: string }>
      runSanityChecks: () => Promise<{ ok: boolean; checks: CheckResult[]; error?: string }>
      installVirtualBox: () => Promise<{ ok: boolean }>
      onScriptLine: (callback: (line: ScriptLine) => void) => () => void
      onScriptDone: (callback: (exitCode: number) => void) => () => void
      readDoc: (filename: string) => Promise<{ ok: boolean; content: string; error?: string }>
      isDev: () => Promise<boolean>
    }
  }
}
