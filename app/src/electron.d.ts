// Type definitions for the API exposed by preload.js via contextBridge.
// This file tells TypeScript what window.electronAPI looks like
// so you get autocomplete and type checking in all React components.

export interface CreateVmParams {
  vmName: string
  vmFolder: string
  isoPath: string
  ramMB: number
  cpus: number
  diskMB: number
  diskType: string
  vramMB: number
  nicType: string
  attachGuestAdditions: boolean
  startVm: boolean
  forceRecreate: boolean
}

export interface ShareFolderParams {
  vmName: string
  hostPath: string
  mountPoint: string
  vmUser: string
  vmPass: string
  loginUser: string
}

export interface ShareLogsParams {
  vmName: string
  hostPath: string
  vmUser: string
  vmPass: string
  loginUser: string
}

export interface ProvisionScriptParams {
  vmName: string
  vmUser: string
  vmPass: string
  loginUser: string
  scriptRelPath: string
  scriptArgs: string
}

export interface ProvisionFullParams {
  vmName: string
  vmUser: string
  vmPass: string
  loginUser: string
  hostname: string
}

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

export interface SharedFolder {
  name: string
  hostPath: string
  mountPoint: string
  existsOnHost: boolean
}

export interface VmInfo {
  osType: string
  state: string
  ramMB: number
  cpus: number
  vramMB: number
  diskCapacityMB: number | null
  diskType: string | null
  nic: string
  mac: string
  sharedFolders: SharedFolder[]
  logSyncPath: string | null
}

export interface ScriptLine {
  text: string
  source: 'stdout' | 'stderr'
}

declare global {
  interface Window {
    electronAPI: {
      listVms: () => Promise<{ ok: boolean; vms: Vm[]; error?: string }>
      getVmInfo: (vmName: string) => Promise<{ ok: true; info: VmInfo } | { ok: false; error?: string }>
      checkVmReady: (vmName: string, vmUser?: string, vmPass?: string) => Promise<{ ok: boolean; running: boolean; guestReady: boolean | null; error?: string }>
      checkVmCredentials: (vmName: string, vmUser: string, vmPass: string) => Promise<{ ok: boolean; isLive?: boolean; error?: string }>
      checkVmUser: (vmName: string, rootUser: string, rootPass: string, vmUser: string) => Promise<{ ok: boolean; error?: string }>
      getVmHostname: (vmName: string, vmUser: string, vmPass: string) => Promise<{ ok: boolean; hostname?: string; error?: string }>
      runShareFolder: (params: ShareFolderParams) => Promise<{ ok: boolean; error?: string; errorDetail?: string }>
      getVmGuestLogsPath: (vmName: string) => Promise<{ ok: boolean; path?: string; error?: string }>
      runShareLogs: (params: ShareLogsParams) => Promise<{ ok: boolean; error?: string; errorDetail?: string }>
      runProvisionScript: (params: ProvisionScriptParams) => Promise<{ ok: boolean; error?: string; errorDetail?: string }>
      runProvisionSetup:  (params: ProvisionFullParams)   => Promise<{ ok: boolean; error?: string; errorDetail?: string }>
      loadVmCredentials: (vmName: string) => Promise<{ ok: boolean; user?: string; pass?: string; loginUser?: string }>
      loadAllVmCredentials: () => Promise<{ ok: true; entries: Record<string, { user: string; pass: string; loginUser: string }> }>
      saveVmCredentials: (vmName: string, user: string, pass: string, loginUser: string) => Promise<{ ok: boolean }>
      queryVmInstalled: (vmName: string) => Promise<
        | { ok: true; installed: Record<string, boolean | string> }
        | { ok: false; vmStopped?: boolean; noCredentials?: boolean; error?: string }
      >
      createVm: (params: CreateVmParams) => Promise<{ ok: boolean; error?: string }>
      startVm: (name: string) => Promise<{ ok: boolean; error?: string }>
      stopVm: (name: string) => Promise<{ ok: boolean; error?: string }>
      restartVm: (name: string) => Promise<{ ok: boolean; error?: string }>
      deleteVm: (name: string) => Promise<{ ok: boolean; error?: string }>
      runSanityChecks: () => Promise<{ ok: boolean; checks: CheckResult[]; error?: string }>
      installVirtualBox: () => Promise<{ ok: boolean }>
      onScriptLine: (callback: (line: ScriptLine) => void) => () => void
      onScriptDone: (callback: (exitCode: number) => void) => () => void
      readDoc: (filename: string) => Promise<{ ok: boolean; content: string; error?: string }>
      readLog: (name: 'gui.log' | 'host.log') => Promise<{ ok: boolean; content?: string; error?: string }>
      openLogDir: (which: 'app' | 'vbox') => Promise<{ ok: boolean; error?: string }>
      getDownloadsPath: () => Promise<{ path: string }>
      pickFolder: () => Promise<{ folderPath: string | null }>
      pickIso: () => Promise<{ filePath: string | null }>
      logError: (message: string, stack: string) => Promise<void>
    }
  }
}
