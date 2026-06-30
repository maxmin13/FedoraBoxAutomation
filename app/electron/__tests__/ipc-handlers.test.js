const { parseVmList, parseChecksOutput } = require('../ipc-handlers')
const fs            = require('fs')
const childProcess  = require('child_process')

// ── Shared setup helper ───────────────────────────────────────────────────────
// Injects an electron stub + optional extra require.cache entries,
// deletes and re-loads ipc-handlers, calls registerIpcHandlers,
// and returns a function that extracts a handler by channel name.
function loadHandlers(electronExtra = {}, extraCache = {}) {
  const mockHandle = vi.fn()

  const electronId = require.resolve('electron')
  const handlersId = require.resolve('../ipc-handlers')

  require.cache[electronId] = {
    id: electronId, filename: electronId, loaded: true,
    exports: {
      ipcMain: { handle: mockHandle },
      app:     { getPath: vi.fn().mockReturnValue('C:\\Users\\test\\Downloads') },
      dialog:  { showOpenDialog: vi.fn() },
      shell:   { openPath: vi.fn() },
      ...electronExtra,
    },
  }

  for (const [id, mod] of Object.entries(extraCache)) {
    require.cache[id] = mod
  }

  delete require.cache[handlersId]
  const { registerIpcHandlers } = require('../ipc-handlers')
  registerIpcHandlers({ webContents: { send: vi.fn() } })

  return (channel) => {
    const call = mockHandle.mock.calls.find(([ch]) => ch === channel)
    return call ? call[1] : null
  }
}

function cleanupHandlers(extraCacheKeys = []) {
  delete require.cache[require.resolve('electron')]
  delete require.cache[require.resolve('../ipc-handlers')]
  for (const key of extraCacheKeys) {
    delete require.cache[key]
  }
}

// ── parseVmList ──────────────────────────────────────────────────────────────

describe('parseVmList', () => {
  it('parses a single VM line', () => {
    const output = '"FedoraVM" {550e8400-e29b-41d4-a716-446655440000}\n'
    expect(parseVmList(output)).toEqual([
      { name: 'FedoraVM', uuid: '550e8400-e29b-41d4-a716-446655440000' },
    ])
  })

  it('parses multiple VMs', () => {
    const output = '"VM One" {111}\n"VM Two" {222}\n'
    expect(parseVmList(output)).toEqual([
      { name: 'VM One', uuid: '111' },
      { name: 'VM Two', uuid: '222' },
    ])
  })

  it('handles VM names with spaces', () => {
    const output = '"My Fedora VM" {abc-def-ghi}\n'
    expect(parseVmList(output)).toEqual([
      { name: 'My Fedora VM', uuid: 'abc-def-ghi' },
    ])
  })

  it('returns an empty array for empty output', () => {
    expect(parseVmList('')).toEqual([])
  })

  it('skips malformed lines and keeps valid ones', () => {
    const output = 'not a valid line\n"GoodVM" {good-uuid}\nalso bad\n'
    expect(parseVmList(output)).toEqual([{ name: 'GoodVM', uuid: 'good-uuid' }])
  })
})

// ── parseChecksOutput ────────────────────────────────────────────────────────

describe('parseChecksOutput', () => {
  const sampleChecks = [
    { id: 'os',  label: 'OS',  status: 'pass', detail: 'Windows 11' },
    { id: 'ram', label: 'RAM', status: 'pass', detail: '16 GB' },
  ]

  it('parses a clean JSON array', () => {
    const lines = [JSON.stringify(sampleChecks)]
    expect(parseChecksOutput(lines)).toEqual(sampleChecks)
  })

  it('extracts the JSON array when noise lines appear before it', () => {
    const lines = [
      'DISM progress: 10%',
      'DISM progress: 90%',
      JSON.stringify(sampleChecks),
    ]
    expect(parseChecksOutput(lines)).toEqual(sampleChecks)
  })

  it('extracts the JSON array when noise lines appear after it', () => {
    const lines = [
      JSON.stringify(sampleChecks),
      'Script completed successfully.',
    ]
    expect(parseChecksOutput(lines)).toEqual(sampleChecks)
  })

  it('returns a single-element array when the script outputs a one-item JSON array', () => {
    const single = sampleChecks[0]
    const lines = [`[${JSON.stringify(single)}]`]
    const result = parseChecksOutput(lines)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([single])
  })

  it('wraps a bare object in an array (Array.isArray guard)', () => {
    const single = sampleChecks[0]
    const spy = vi.spyOn(JSON, 'parse').mockReturnValueOnce(single)
    try {
      const result = parseChecksOutput([`[placeholder]`])
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([single])
    } finally {
      spy.mockRestore()
    }
  })

  it('throws when stdout contains no JSON array', () => {
    expect(() => parseChecksOutput(['No brackets here'])).toThrow(
      'No JSON array found in script output'
    )
  })

  it('includes a stdout snippet in the error message', () => {
    expect(() => parseChecksOutput(['plain text output'])).toThrow('plain text output')
  })

  it('throws when the JSON between the brackets is malformed', () => {
    // '[' and ']' are both present so the bracket-finder passes; JSON.parse fails.
    expect(() => parseChecksOutput(['[not valid json]'])).toThrow()
  })

  it('includes stderr lines in the error message when available', () => {
    expect(() =>
      parseChecksOutput(['no brackets'], ['VBoxManage not found'])
    ).toThrow('VBoxManage not found')
  })
})

// ── get-downloads-path handler ───────────────────────────────────────────────
// Vitest 2.x node environment does not intercept transitive CJS require() calls
// from dependencies, so vi.mock('electron') cannot reach ipc-handlers.js.
// We work around this by injecting a stub directly into require.cache before
// re-loading the module, which is the only reliable approach in this setup.

describe('get-downloads-path handler', () => {
  let downloadsHandler
  let mockGetPath
  const DOWNLOADS = 'C:\\Users\\test\\Downloads'

  beforeAll(() => {
    const mockHandle = vi.fn()
    mockGetPath = vi.fn().mockReturnValue(DOWNLOADS)

    const electronId = require.resolve('electron')
    const handlersId = require.resolve('../ipc-handlers')

    // Inject the electron stub so the fresh ipc-handlers load sees it
    require.cache[electronId] = {
      id: electronId, filename: electronId, loaded: true,
      exports: { ipcMain: { handle: mockHandle }, app: { getPath: mockGetPath } },
    }

    // Force ipc-handlers to reload with the stub in place
    delete require.cache[handlersId]
    const { registerIpcHandlers } = require('../ipc-handlers')

    registerIpcHandlers({ webContents: { send: vi.fn() } })

    const call = mockHandle.mock.calls.find(([ch]) => ch === 'get-downloads-path')
    downloadsHandler = call[1]
  })

  afterAll(() => {
    // Remove the injected stub so later tests start clean
    delete require.cache[require.resolve('electron')]
    delete require.cache[require.resolve('../ipc-handlers')]
  })

  it('returns the OS downloads path from app.getPath', async () => {
    const result = await downloadsHandler({} /* event */)
    expect(result).toEqual({ path: DOWNLOADS })
  })

  it('calls app.getPath with "downloads"', async () => {
    mockGetPath.mockClear()
    await downloadsHandler({})
    expect(mockGetPath).toHaveBeenCalledWith('downloads')
  })
})

// ── open-log-dir handler ─────────────────────────────────────────────────────

describe('open-log-dir handler', () => {
  let openLogDirHandler
  const mockOpenPath = vi.fn().mockResolvedValue('')  // '' means success in shell.openPath

  beforeAll(() => {
    const mockHandle = vi.fn()

    const electronId = require.resolve('electron')
    const handlersId = require.resolve('../ipc-handlers')

    require.cache[electronId] = {
      id: electronId, filename: electronId, loaded: true,
      exports: {
        ipcMain:  { handle: mockHandle },
        app:      { getPath: vi.fn() },
        dialog:   {},
        shell:    { openPath: mockOpenPath },
      },
    }

    delete require.cache[handlersId]
    const { registerIpcHandlers } = require('../ipc-handlers')
    registerIpcHandlers({ webContents: { send: vi.fn() } })

    const call = mockHandle.mock.calls.find(([ch]) => ch === 'open-log-dir')
    openLogDirHandler = call[1]
  })

  afterAll(() => {
    delete require.cache[require.resolve('electron')]
    delete require.cache[require.resolve('../ipc-handlers')]
  })

  it('returns ok: true when shell.openPath succeeds', async () => {
    mockOpenPath.mockResolvedValue('')
    const result = await openLogDirHandler({}, 'app')
    expect(result).toEqual({ ok: true })
  })

  it('calls shell.openPath with a path containing "FedoraBoxAutomation" for "app"', async () => {
    mockOpenPath.mockResolvedValue('')
    await openLogDirHandler({}, 'app')
    expect(mockOpenPath).toHaveBeenCalledWith(expect.stringContaining('FedoraBoxAutomation'))
  })

  it('calls shell.openPath with a path containing "VirtualBox VMs" for "vbox"', async () => {
    mockOpenPath.mockResolvedValue('')
    await openLogDirHandler({}, 'vbox')
    expect(mockOpenPath).toHaveBeenCalledWith(expect.stringContaining('VirtualBox VMs'))
  })

  it('returns ok: false when shell.openPath returns an error string', async () => {
    mockOpenPath.mockResolvedValue('No such file or directory')
    const result = await openLogDirHandler({}, 'app')
    expect(result).toEqual({ ok: false, error: 'No such file or directory' })
  })

  it('returns ok: false for an unknown "which" value', async () => {
    const result = await openLogDirHandler({}, 'unknown')
    expect(result.ok).toBe(false)
  })
})

// ── read-doc handler ─────────────────────────────────────────────────────────

describe('read-doc handler', () => {
  let readDocHandler
  let mockReadFile

  beforeAll(() => {
    // Spy on fs.promises.readFile before reloading the module so the fresh load picks up the spy
    mockReadFile = vi.spyOn(fs.promises, 'readFile')
    readDocHandler = loadHandlers()('read-doc')
  })

  afterAll(() => {
    mockReadFile.mockRestore()
    cleanupHandlers()
  })

  it('returns ok: true with the file content when the file exists', async () => {
    mockReadFile.mockResolvedValueOnce('# My Doc\nSome content.')
    const result = await readDocHandler({}, 'README.md')
    expect(result).toEqual({ ok: true, content: '# My Doc\nSome content.' })
  })

  it('returns ok: false with an error message when the file does not exist', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))
    const result = await readDocHandler({}, 'missing.md')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/missing\.md/)
  })

  it('reads from the docs/ directory (path does not traverse outside the repo)', async () => {
    mockReadFile.mockResolvedValueOnce('')
    await readDocHandler({}, 'SETUP.md')
    const calledPath = mockReadFile.mock.calls.at(-1)[0]
    expect(calledPath).toMatch(/docs[\\/]SETUP\.md$/)
  })
})

// ── load-vm-credentials handler ───────────────────────────────────────────────

describe('load-vm-credentials handler', () => {
  let loadCredsHandler
  let mockReadFile

  const CREDS_STORE = { FedoraBox: { user: 'root', pass: 'secret', loginUser: 'fedora' } }

  beforeAll(() => {
    mockReadFile = vi.spyOn(fs.promises, 'readFile')
    loadCredsHandler = loadHandlers()('load-vm-credentials')
  })

  afterAll(() => {
    mockReadFile.mockRestore()
    cleanupHandlers()
  })

  it('returns credentials for a known VM', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify(CREDS_STORE))
    const result = await loadCredsHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true, user: 'root', pass: 'secret', loginUser: 'fedora' })
  })

  it('returns ok: false for an unknown VM', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify(CREDS_STORE))
    const result = await loadCredsHandler({}, 'NonExistent')
    expect(result.ok).toBe(false)
  })

  it('returns ok: false when the credentials file does not exist', async () => {
    mockReadFile.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const result = await loadCredsHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
  })

  it('strips the UTF-8 BOM that PowerShell 5.1 writes', async () => {
    const bom = '﻿'
    mockReadFile.mockResolvedValueOnce(bom + JSON.stringify(CREDS_STORE))
    const result = await loadCredsHandler({}, 'FedoraBox')
    expect(result.ok).toBe(true)
    expect(result.user).toBe('root')
  })

  it('returns empty strings for missing optional credential fields and includes a warning', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ FedoraBox: {} }))
    const result = await loadCredsHandler({}, 'FedoraBox')
    expect(result).toMatchObject({ ok: true, user: '', pass: '', loginUser: '' })
    expect(result.warning).toMatch(/missing fields/)
  })
})

// ── save-vm-credentials handler ───────────────────────────────────────────────

describe('save-vm-credentials handler', () => {
  let saveCredsHandler
  let mockReadFile, mockMkdir, mockWriteFile

  beforeAll(() => {
    mockReadFile  = vi.spyOn(fs.promises, 'readFile')
    mockMkdir     = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
    mockWriteFile = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
    saveCredsHandler = loadHandlers()('save-vm-credentials')
  })

  afterAll(() => {
    mockReadFile.mockRestore()
    mockMkdir.mockRestore()
    mockWriteFile.mockRestore()
    cleanupHandlers()
  })

  it('returns ok: true after writing', async () => {
    mockReadFile.mockResolvedValueOnce('{}')
    const result = await saveCredsHandler({}, { vmName: 'FedoraBox', user: 'root', pass: 'pw', loginUser: 'alice' })
    expect(result).toEqual({ ok: true })
  })

  it('writes the new entry to the credentials file', async () => {
    mockReadFile.mockResolvedValueOnce('{}')
    await saveCredsHandler({}, { vmName: 'FedoraBox', user: 'root', pass: 'pw', loginUser: 'alice' })
    const written = JSON.parse(Buffer.from(mockWriteFile.mock.calls.at(-1)[1], 'base64').toString('utf8'))
    expect(written.FedoraBox).toEqual({ user: 'root', pass: 'pw', loginUser: 'alice' })
  })

  it('merges with existing entries rather than overwriting them', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ OtherVM: { user: 'admin', pass: 'x', loginUser: 'y' } }))
    await saveCredsHandler({}, { vmName: 'FedoraBox', user: 'root', pass: 'pw', loginUser: 'alice' })
    const written = JSON.parse(Buffer.from(mockWriteFile.mock.calls.at(-1)[1], 'base64').toString('utf8'))
    expect(written.OtherVM).toBeDefined()
    expect(written.FedoraBox).toBeDefined()
  })

  it('creates the credentials directory if it does not exist', async () => {
    mockReadFile.mockResolvedValueOnce('{}')
    await saveCredsHandler({}, { vmName: 'FedoraBox', user: 'root', pass: 'pw', loginUser: 'alice' })
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('.vm-data'), { recursive: true })
  })

  it('preserves the existing loginUser when the new value is empty', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ FedoraBox: { user: 'root', pass: 'old', loginUser: 'fedora' } }))
    await saveCredsHandler({}, { vmName: 'FedoraBox', user: 'root', pass: 'new', loginUser: '' })
    const written = JSON.parse(Buffer.from(mockWriteFile.mock.calls.at(-1)[1], 'base64').toString('utf8'))
    expect(written.FedoraBox.loginUser).toBe('fedora')
  })

  it('overwrites loginUser when the new value is non-empty', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ FedoraBox: { user: 'root', pass: 'old', loginUser: 'olduser' } }))
    await saveCredsHandler({}, { vmName: 'FedoraBox', user: 'root', pass: 'new', loginUser: 'newuser' })
    const written = JSON.parse(Buffer.from(mockWriteFile.mock.calls.at(-1)[1], 'base64').toString('utf8'))
    expect(written.FedoraBox.loginUser).toBe('newuser')
  })
})

// ── query-vm-installed handler ────────────────────────────────────────────────

describe('query-vm-installed handler', () => {
  let queryVmInstalledHandler
  let mockExec      // callback-based; used by isVmRunning (execAsync)
  let mockExecSync  // used by the guestcontrol copyto / run calls
  let mockReadFile

  const INSTALLED_JSON = JSON.stringify({
    baseSetup: true, java: true, php: false, python: false, node: true,
    maven: false, httpd: false, tomcat: false, mariadb: false, postgresql: false,
    dbeaver: false, eclipse: false, visualStudioCode: false, docker: true,
    minikube: false, k3s: false, awsCli: false, ecsCli: false, openssl: false,
    wireshark: false, git: true, vim: true, chrome: false, ansible: false, claudeCode: false,
  })

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExec     = vi.fn()
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync, exec: mockExec, execFile: vi.fn() },
    }
    mockReadFile = vi.spyOn(fs.promises, 'readFile')
    queryVmInstalledHandler = loadHandlers()('query-vm-installed')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    mockReadFile.mockRestore()
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExec.mockReset()
    mockExecSync.mockReset()
    mockReadFile.mockReset()
  })

  it('returns { ok: false, vmStopped: true } when the VM is not running', async () => {
    mockExec.mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="poweroff"\n', stderr: '' }))
    const result = await queryVmInstalledHandler({}, { vmName: 'FedoraBox' })
    expect(result).toEqual({ ok: false, vmStopped: true })
  })

  it('returns { ok: false, noCredentials: true } when no credentials are saved', async () => {
    mockExec.mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="running"\n', stderr: '' }))
    mockReadFile.mockResolvedValueOnce('{}')
    const result = await queryVmInstalledHandler({}, { vmName: 'FedoraBox' })
    expect(result).toEqual({ ok: false, noCredentials: true })
  })

  it('returns { ok: true, installed } when guestcontrol succeeds', async () => {
    mockExec
      .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="running"\n', stderr: '' })) // isVmRunning
      .mockImplementationOnce((cmd, opts, cb) => cb(null, ''))                                            // execTracked copyto
      .mockImplementationOnce((cmd, opts, cb) => cb(null, INSTALLED_JSON))                               // execTracked run
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ FedoraBox: { user: 'root', pass: 'secret' } })
    )
    const result = await queryVmInstalledHandler({}, { vmName: 'FedoraBox' })
    expect(result.ok).toBe(true)
    expect(result.installed.baseSetup).toBe(true)
    expect(result.installed.java).toBe(true)
    expect(result.installed.php).toBe(false)
    expect(result.installed.docker).toBe(true)
  })

  it('returns { ok: false, error } when guestcontrol throws', async () => {
    mockExec
      .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="running"\n', stderr: '' })) // isVmRunning
      .mockImplementationOnce((cmd, opts, cb) => cb(Object.assign(new Error('VERR_AUTHENTICATION_FAILURE'), { stderr: 'VERR_AUTHENTICATION_FAILURE' })))  // execTracked copyto throws
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ FedoraBox: { user: 'root', pass: 'wrong' } })
    )
    const result = await queryVmInstalledHandler({}, { vmName: 'FedoraBox' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/VERR_AUTHENTICATION_FAILURE/)
  })
})

// ── check-vm-ready handler ────────────────────────────────────────────────────

describe('check-vm-ready handler', () => {
  let checkVmReadyHandler
  let mockExecSync

  beforeAll(() => {
    // Spy AFTER initial load so ipc-handlers re-load picks it up via require.cache injection
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync, exec: vi.fn(), execFile: vi.fn() },
    }
    checkVmReadyHandler = loadHandlers()('check-vm-ready')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  it('returns running: false and guestReady: false when VM is stopped', async () => {
    mockExecSync.mockReturnValueOnce('VMState="poweroff"\n')
    const result = await checkVmReadyHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true, running: false, guestReady: false })
  })

  it('returns guestReady: null when VM is running but no credentials supplied', async () => {
    mockExecSync.mockReturnValueOnce('VMState="running"\n')
    const result = await checkVmReadyHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true, running: true, guestReady: null })
  })

  it('returns guestReady: true when guestcontrol ping succeeds', async () => {
    mockExecSync
      .mockReturnValueOnce('VMState="running"\n')  // showvminfo
      .mockReturnValueOnce('ok\n')                  // guestcontrol echo
    const result = await checkVmReadyHandler({}, 'FedoraBox', 'root', 'secret')
    expect(result).toEqual({ ok: true, running: true, guestReady: true })
  })

  it('returns guestReady: false when guestcontrol ping fails', async () => {
    mockExecSync
      .mockReturnValueOnce('VMState="running"\n')
      .mockImplementationOnce(() => { throw new Error('guestcontrol failed') })
    const result = await checkVmReadyHandler({}, 'FedoraBox', 'root', 'secret')
    expect(result).toEqual({ ok: true, running: true, guestReady: false })
  })

  it('returns ok: false when showvminfo throws', async () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error('VBoxManage not found') })
    const result = await checkVmReadyHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
    expect(result.running).toBe(false)
  })
})

// ── pick-folder handler ───────────────────────────────────────────────────────

describe('pick-folder handler', () => {
  let pickFolderHandler
  const mockShowOpenDialog = vi.fn()

  beforeAll(() => {
    pickFolderHandler = loadHandlers({ dialog: { showOpenDialog: mockShowOpenDialog } })('pick-folder')
  })

  afterAll(() => {
    cleanupHandlers()
  })

  it('returns the selected folder path when the user picks a folder', async () => {
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\Users\\test\\shared'] })
    const result = await pickFolderHandler({})
    expect(result).toEqual({ folderPath: 'C:\\Users\\test\\shared' })
  })

  it('returns folderPath: null when the user cancels', async () => {
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    const result = await pickFolderHandler({})
    expect(result).toEqual({ folderPath: null })
  })

  it('opens the dialog with openDirectory property', async () => {
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await pickFolderHandler({})
    expect(mockShowOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ properties: expect.arrayContaining(['openDirectory']) })
    )
  })
})

// ── pick-iso handler ──────────────────────────────────────────────────────────

describe('pick-iso handler', () => {
  let pickIsoHandler
  const mockShowOpenDialog = vi.fn()

  beforeAll(() => {
    pickIsoHandler = loadHandlers({ dialog: { showOpenDialog: mockShowOpenDialog } })('pick-iso')
  })

  afterAll(() => {
    cleanupHandlers()
  })

  it('returns the selected ISO file path when the user picks a file', async () => {
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\Downloads\\fedora.iso'] })
    const result = await pickIsoHandler({})
    expect(result).toEqual({ filePath: 'C:\\Downloads\\fedora.iso' })
  })

  it('returns filePath: null when the user cancels', async () => {
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    const result = await pickIsoHandler({})
    expect(result).toEqual({ filePath: null })
  })

  it('filters to .iso files', async () => {
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await pickIsoHandler({})
    const { filters } = mockShowOpenDialog.mock.calls.at(-1)[0]
    expect(filters.some((f) => f.extensions.includes('iso'))).toBe(true)
  })
})

// ── read-log handler ──────────────────────────────────────────────────────────

describe('read-log handler', () => {
  let readLogHandler
  let mockReadFile

  beforeAll(() => {
    mockReadFile = vi.spyOn(fs.promises, 'readFile')
    readLogHandler = loadHandlers()('read-log')
  })

  afterAll(() => {
    mockReadFile.mockRestore()
    cleanupHandlers()
  })

  it('returns ok: false for an unknown log name', async () => {
    const result = await readLogHandler({}, 'secret.log')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unknown log file/i)
  })

  it('returns ok: true with content for gui.log', async () => {
    mockReadFile.mockResolvedValueOnce('line 1\nline 2\n')
    const result = await readLogHandler({}, 'gui.log')
    expect(result.ok).toBe(true)
    expect(result.content).toContain('line 1')
  })

  it('returns ok: true with content for host.log', async () => {
    mockReadFile.mockResolvedValueOnce('host log line\n')
    const result = await readLogHandler({}, 'host.log')
    expect(result.ok).toBe(true)
    expect(result.content).toContain('host log line')
  })

  it('returns ok: true with empty content when the file does not exist', async () => {
    mockReadFile.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const result = await readLogHandler({}, 'gui.log')
    expect(result).toEqual({ ok: true, content: '' })
  })

  it('returns only the last 500 lines when the file has more', async () => {
    const manyLines = Array.from({ length: 600 }, (_, i) => `line ${i}`).join('\n')
    mockReadFile.mockResolvedValueOnce(manyLines)
    const result = await readLogHandler({}, 'gui.log')
    const lineCount = result.content.split('\n').filter(Boolean).length
    expect(lineCount).toBeLessThanOrEqual(500)
    expect(result.content).toContain('line 599')
    expect(result.content).not.toContain('line 0\n')
  })
})

// ── list-vms handler ──────────────────────────────────────────────────────────

describe('list-vms handler', () => {
  let listVmsHandler
  let mockExecSync
  let mockExec

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    mockExec = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync, exec: mockExec, execFile: vi.fn() },
    }
    listVmsHandler = loadHandlers()('list-vms')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExecSync.mockReset()
    mockExec.mockReset()
  })

  it('returns all VMs with the running field set correctly', async () => {
    mockExecSync
      .mockReturnValueOnce('"FedoraBox" {uuid-1}\n"OtherVM" {uuid-2}\n') // list vms
      .mockReturnValueOnce('"FedoraBox" {uuid-1}\n')                       // list runningvms
    // FedoraBox is running so execAsync (promisify(exec)) is called for GA run level check
    mockExec.mockImplementationOnce((cmd, opts, cb) =>
      cb(null, { stdout: 'GuestAdditionsRunLevel=1\n', stderr: '' })
    )
    const result = await listVmsHandler({})
    expect(result.ok).toBe(true)
    expect(result.vms).toEqual([
      { name: 'FedoraBox', uuid: 'uuid-1', processRunning: true,  running: true  },
      { name: 'OtherVM',   uuid: 'uuid-2', processRunning: false, running: false },
    ])
  })

  it('marks no VMs as running when the runningvms list is empty', async () => {
    mockExecSync
      .mockReturnValueOnce('"FedoraBox" {uuid-1}\n')
      .mockReturnValueOnce('')
    const result = await listVmsHandler({})
    expect(result.vms[0].running).toBe(false)
  })

  it('returns an empty vms array when no VMs are registered', async () => {
    mockExecSync
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
    const result = await listVmsHandler({})
    expect(result.ok).toBe(true)
    expect(result.vms).toEqual([])
  })

  it('returns ok: false when VBoxManage throws', async () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error('VBoxManage not found') })
    const result = await listVmsHandler({})
    expect(result.ok).toBe(false)
    expect(result.vms).toEqual([])
  })
})

// ── start-vm handler ──────────────────────────────────────────────────────────
// isVmRunning and the startvm call both use execAsync (promisified exec),
// so we mock exec (callback-based) rather than execSync.

describe('start-vm handler', () => {
  let startVmHandler
  let mockExec

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExec = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: vi.fn(), exec: mockExec, execFile: vi.fn() },
    }
    startVmHandler = loadHandlers()('start-vm')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExec.mockReset()
  })

  it('returns ok: true without calling startvm when VM is already running', async () => {
    mockExec.mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="running"\n', stderr: '' }))
    const result = await startVmHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true })
    // Only the showvminfo call, not startvm
    expect(mockExec).toHaveBeenCalledTimes(1)
  })

  it('calls VBoxManage startvm --type gui when VM is stopped', async () => {
    mockExec
      .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="poweroff"\n', stderr: '' }))
      .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '', stderr: '' }))
    const result = await startVmHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true })
    const cmds = mockExec.mock.calls.map(([cmd]) => cmd)
    expect(cmds.some(c => c.includes('startvm'))).toBe(true)
  })

  it('returns ok: false when VBoxManage startvm throws', async () => {
    mockExec
      .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="poweroff"\n', stderr: '' }))
      .mockImplementationOnce((cmd, opts, cb) => cb(new Error('VM not found')))
    const result = await startVmHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/VM not found/)
  })
})

// ── delete-vm handler ─────────────────────────────────────────────────────────

describe('delete-vm handler', () => {
  let deleteVmHandler
  let mockExecSync
  let mockReadFile, mockMkdir, mockWriteFile, mockRm

  // CfgFile line returned by the showvminfo call that precedes unregistervm
  const SHOWVMINFO = 'CfgFile="C:/VMs/FedoraBox/FedoraBox.vbox"\n'

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync, exec: vi.fn(), execFile: vi.fn() },
    }
    mockReadFile  = vi.spyOn(fs.promises, 'readFile')
    mockMkdir     = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
    mockWriteFile = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
    mockRm        = vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined)
    deleteVmHandler = loadHandlers()('delete-vm')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    mockReadFile.mockRestore()
    mockMkdir.mockRestore()
    mockWriteFile.mockRestore()
    mockRm.mockRestore()
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExecSync.mockReset()
    mockReadFile.mockReset()
    mockWriteFile.mockClear()
    mockRm.mockClear()
  })

  it('calls VBoxManage unregistervm --delete', async () => {
    mockExecSync.mockReturnValueOnce(SHOWVMINFO).mockReturnValueOnce('')
    mockReadFile.mockResolvedValueOnce('{}')
    await deleteVmHandler({}, 'FedoraBox')
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('unregistervm'),
      expect.anything()
    )
  })

  it('returns ok: true on success', async () => {
    mockExecSync.mockReturnValueOnce(SHOWVMINFO).mockReturnValueOnce('')
    mockReadFile.mockResolvedValueOnce('{}')
    const result = await deleteVmHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true })
  })

  it('removes the machine folder after unregistering', async () => {
    mockExecSync.mockReturnValueOnce(SHOWVMINFO).mockReturnValueOnce('')
    mockReadFile.mockResolvedValueOnce('{}')
    await deleteVmHandler({}, 'FedoraBox')
    expect(mockRm).toHaveBeenCalledWith('C:/VMs/FedoraBox', { recursive: true, force: true })
  })

  it('removes saved credentials for the deleted VM', async () => {
    mockExecSync.mockReturnValueOnce(SHOWVMINFO).mockReturnValueOnce('')
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ FedoraBox: { user: 'root', pass: 'x', loginUser: 'y' } })
    )
    await deleteVmHandler({}, 'FedoraBox')
    const written = JSON.parse(Buffer.from(mockWriteFile.mock.calls.at(-1)[1], 'base64').toString('utf8'))
    expect(written.FedoraBox).toBeUndefined()
  })

  it('returns ok: false when VBoxManage unregistervm throws', async () => {
    mockExecSync
      .mockReturnValueOnce(SHOWVMINFO)
      .mockImplementationOnce(() => { throw new Error('VM is locked') })
    const result = await deleteVmHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/VM is locked/)
  })
})

// ── get-vm-guest-logs-path handler ────────────────────────────────────────────

describe('get-vm-guest-logs-path handler', () => {
  let getVmGuestLogsPathHandler
  let mockExecSync

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync, exec: vi.fn(), execFile: vi.fn() },
    }
    getVmGuestLogsPathHandler = loadHandlers()('get-vm-guest-logs-path')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExecSync.mockReset()
  })

  it('returns a path ending in "guest-logs"', async () => {
    mockExecSync.mockReturnValueOnce('CfgFile="C:\\VMs\\FedoraBox\\FedoraBox.vbox"\n')
    const result = await getVmGuestLogsPathHandler({}, 'FedoraBox')
    expect(result.ok).toBe(true)
    expect(result.path).toMatch(/guest-logs$/)
  })

  it('returns a path inside the VM folder', async () => {
    mockExecSync.mockReturnValueOnce('CfgFile="C:\\VMs\\FedoraBox\\FedoraBox.vbox"\n')
    const result = await getVmGuestLogsPathHandler({}, 'FedoraBox')
    expect(result.path).toContain('FedoraBox')
  })

  it('returns ok: false when the CfgFile line is missing from showvminfo output', async () => {
    mockExecSync.mockReturnValueOnce('VMState="poweroff"\n')
    const result = await getVmGuestLogsPathHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/config file/i)
  })

  it('returns ok: false when VBoxManage throws', async () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error('VBoxManage not found') })
    const result = await getVmGuestLogsPathHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
  })
})

// ── stop-vm handler ───────────────────────────────────────────────────────────
// isVmRunning, acpipowerbutton, and poweroff all use execAsync (promisified exec),
// so we mock exec (callback-based) rather than execSync.

describe('stop-vm handler', () => {
  let stopVmHandler
  let mockExec

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExec = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: vi.fn(), exec: mockExec, execFile: vi.fn() },
    }
    stopVmHandler = loadHandlers()('stop-vm')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExec.mockReset()
  })

  it('returns ok: true without calling ACPI when VM is already stopped', async () => {
    mockExec.mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="poweroff"\r\n', stderr: '' }))
    const result = await stopVmHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true })
    expect(mockExec).toHaveBeenCalledTimes(1)
  })

  it('sends ACPI shutdown and returns ok when VM stops during polling', async () => {
    vi.useFakeTimers()
    try {
      mockExec
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="running"\r\n', stderr: '' }))  // isVmRunning → running
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '', stderr: '' }))                        // acpipowerbutton
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="poweroff"\r\n', stderr: '' })) // first poll → stopped
      const promise = stopVmHandler({}, 'FedoraBox')
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result).toEqual({ ok: true })
      const cmds = mockExec.mock.calls.map(([cmd]) => cmd)
      expect(cmds.some(c => c.includes('acpipowerbutton'))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to forced poweroff when ACPI shutdown times out', async () => {
    vi.useFakeTimers()
    try {
      mockExec
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="running"\r\n', stderr: '' }))  // initial isVmRunning
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '', stderr: '' }))                        // acpipowerbutton
        .mockImplementation((cmd, opts, cb) => cb(null, { stdout: 'VMState="running"\r\n', stderr: '' }))       // all polls + final poweroff
      const promise = stopVmHandler({}, 'FedoraBox')
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result).toEqual({ ok: true })
      const cmds = mockExec.mock.calls.map(([cmd]) => cmd)
      expect(cmds.some(c => c.includes('poweroff'))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns ok: false when the acpipowerbutton command throws', async () => {
    mockExec
      .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: 'VMState="running"\r\n', stderr: '' }))  // isVmRunning → running
      .mockImplementationOnce((cmd, opts, cb) => cb(new Error('VM is locked')))                               // acpipowerbutton
    const result = await stopVmHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/VM is locked/)
  })
})

// ── get-vm-info handler ───────────────────────────────────────────────────────

describe('get-vm-info handler', () => {
  let getVmInfoHandler
  let mockExecSync
  let mockExistsSync

  // Minimal machinereadable fixture for a stopped VM with a disk
  const MR_STOPPED = [
    'VMState="poweroff"\r',
    'ostype="Fedora_64"\r',
    'memory="4096"\r',
    'cpus="2"\r',
    'vram="128"\r',
    'nic1="nat"\r',
    'macaddress1="080027AABBCC"\r',
    'CfgFile="C:\\VMs\\FedoraBox\\FedoraBox.vbox"\r',
    'SATA-0-0-ImageUUID="disk-uuid-1234"\r',
  ].join('\n')

  const MR_RUNNING = MR_STOPPED.replace('VMState="poweroff"', 'VMState="running"')

  // Minimal machinereadable fixture with a shared folder (no disk UUID)
  const MR_WITH_SF = [
    'VMState="poweroff"\r',
    'ostype="Fedora_64"\r',
    'memory="4096"\r',
    'cpus="2"\r',
    'vram="128"\r',
    'nic1="nat"\r',
    'macaddress1="080027AABBCC"\r',
    'CfgFile="C:\\VMs\\FedoraBox\\FedoraBox.vbox"\r',
    'SharedFolderNameMachineMapping1="vbox-share"\r',
    'SharedFolderPathMachineMapping1="C:\\Work\\shared"\r',
  ].join('\n')

  const MEDIUM_INFO_DYNAMIC = 'Capacity: 51200 MBytes\nFormat variant: dynamic default\n'
  const MEDIUM_INFO_FIXED   = 'Capacity: 20480 MBytes\nFormat variant: fixed\n'

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync, exec: vi.fn(), execFile: vi.fn() },
    }
    mockExistsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    getVmInfoHandler = loadHandlers()('get-vm-info')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    mockExistsSync.mockRestore()
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExecSync.mockReset()
  })

  it('returns parsed basic fields (osType, state, ramMB, cpus, vramMB, nic, mac)', async () => {
    mockExecSync
      .mockReturnValueOnce(MR_STOPPED)          // showvminfo --machinereadable
      .mockReturnValueOnce('')                   // showvminfo plain (best-effort)
      .mockReturnValueOnce(MEDIUM_INFO_DYNAMIC) // showmediuminfo
    const result = await getVmInfoHandler({}, 'FedoraBox')
    expect(result.ok).toBe(true)
    expect(result.info.osType).toBe('Fedora_64')
    expect(result.info.state).toBe('poweroff')
    expect(result.info.ramMB).toBe(4096)
    expect(result.info.cpus).toBe(2)
    expect(result.info.vramMB).toBe(128)
    expect(result.info.nic).toBe('nat')
    expect(result.info.mac).toBe('080027AABBCC')
  })

  it('returns logSyncPath as null when the guest-logs share is not registered', async () => {
    mockExecSync
      .mockReturnValueOnce(MR_STOPPED)
      .mockReturnValueOnce('')
      .mockReturnValueOnce(MEDIUM_INFO_DYNAMIC)
    const result = await getVmInfoHandler({}, 'FedoraBox')
    expect(result.info.logSyncPath).toBeNull()
  })

  it('returns diskCapacityMB and diskType from showmediuminfo', async () => {
    mockExecSync
      .mockReturnValueOnce(MR_STOPPED)
      .mockReturnValueOnce('')
      .mockReturnValueOnce(MEDIUM_INFO_DYNAMIC)
    const result = await getVmInfoHandler({}, 'FedoraBox')
    expect(result.info.diskCapacityMB).toBe(51200)
    expect(result.info.diskType).toBe('dynamic')
  })

  it('returns diskType "fixed" when showmediuminfo reports fixed variant', async () => {
    mockExecSync
      .mockReturnValueOnce(MR_STOPPED)
      .mockReturnValueOnce('')
      .mockReturnValueOnce(MEDIUM_INFO_FIXED)
    const result = await getVmInfoHandler({}, 'FedoraBox')
    expect(result.info.diskType).toBe('fixed')
  })

  it('returns shared folders with mountPoint merged from plain showvminfo', async () => {
    const plainWithSf = "Name: 'vbox-share', Host path: 'C:\\Work\\shared' (machine mapping), writable, mount-point: '/mnt/shared'\n"
    mockExecSync
      .mockReturnValueOnce(MR_WITH_SF)
      .mockReturnValueOnce(plainWithSf)
    const result = await getVmInfoHandler({}, 'FedoraBox')
    expect(result.info.sharedFolders).toHaveLength(1)
    expect(result.info.sharedFolders[0]).toMatchObject({
      name:       'vbox-share',
      hostPath:   'C:\\Work\\shared',
      mountPoint: '/mnt/shared',
    })
  })

  it('filters the log-sync share (guest-logs) out of sharedFolders', async () => {
    // The guest-logs folder is registered as a VirtualBox shared folder by
    // share-logs.ps1 so the VM can mount /mnt/log.  It must NOT appear in the
    // user-facing "Shared folders" list — it is already shown under "Log sync".
    const MR_WITH_LOG_SHARE = [
      'VMState="poweroff"\r',
      'ostype="Fedora_64"\r',
      'memory="4096"\r',
      'cpus="2"\r',
      'vram="128"\r',
      'nic1="nat"\r',
      'macaddress1="080027AABBCC"\r',
      'CfgFile="C:\\VMs\\FedoraBox\\FedoraBox.vbox"\r',
      'SharedFolderNameMachineMapping1="guest-logs"\r',
      'SharedFolderPathMachineMapping1="C:\\VMs\\FedoraBox\\guest-logs"\r',
    ].join('\n')
    mockExecSync
      .mockReturnValueOnce(MR_WITH_LOG_SHARE)
      .mockReturnValueOnce('') // plain showvminfo
    const result = await getVmInfoHandler({}, 'FedoraBox')
    expect(result.ok).toBe(true)
    expect(result.info.sharedFolders).toHaveLength(0)
    // logSyncPath is still populated correctly
    expect(result.info.logSyncPath).toMatch(/guest-logs$/)
  })

  it('keeps non-log-sync shared folders when log-sync share is also present', async () => {
    const MR_WITH_BOTH = [
      'VMState="poweroff"\r',
      'ostype="Fedora_64"\r',
      'memory="4096"\r',
      'cpus="2"\r',
      'vram="128"\r',
      'nic1="nat"\r',
      'macaddress1="080027AABBCC"\r',
      'CfgFile="C:\\VMs\\FedoraBox\\FedoraBox.vbox"\r',
      'SharedFolderNameMachineMapping1="vbox-share"\r',
      'SharedFolderPathMachineMapping1="C:\\Work\\shared"\r',
      'SharedFolderNameMachineMapping2="guest-logs"\r',
      'SharedFolderPathMachineMapping2="C:\\VMs\\FedoraBox\\guest-logs"\r',
    ].join('\n')
    mockExecSync
      .mockReturnValueOnce(MR_WITH_BOTH)
      .mockReturnValueOnce('') // plain showvminfo
    const result = await getVmInfoHandler({}, 'FedoraBox')
    expect(result.ok).toBe(true)
    expect(result.info.sharedFolders).toHaveLength(1)
    expect(result.info.sharedFolders[0].name).toBe('vbox-share')
  })

  it('returns ok: false when the main VBoxManage call throws', async () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error('VM not found') })
    const result = await getVmInfoHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/VM not found/)
  })
})

// ── run-share-folder handler ──────────────────────────────────────────────────

describe('run-share-folder handler', () => {
  let runShareFolderHandler
  let mockRunScript

  const PARAMS = {
    vmName:     'FedoraBox',
    hostPath:   'C:\\Work\\shared',
    mountPoint: '/mnt/shared',
    vmUser:     'root',
    vmPass:     'secret',
    loginUser:  'fedora',
  }

  beforeAll(() => {
    mockRunScript = vi.fn()
    const srId = require.resolve('../script-runner')
    require.cache[srId] = {
      id: srId, filename: srId, loaded: true,
      exports: { runScript: mockRunScript, hasActiveScript: vi.fn(), killActiveScript: vi.fn(), setRunContext: vi.fn(), getScriptState: vi.fn(), clearScriptState: vi.fn() },
    }
    runShareFolderHandler = loadHandlers()('run-share-folder')
  })

  afterAll(() => {
    delete require.cache[require.resolve('../script-runner')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockRunScript.mockReset()
  })

  it('returns ok: true when the script exits 0', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    const result = await runShareFolderHandler({}, PARAMS)
    expect(result).toEqual({ ok: true })
  })

  it('returns errorDetail from the last ERROR: prefixed line on failure', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: 'Starting setup...', source: 'stdout' })
      onLine({ text: 'ERROR: guest control failed', source: 'stdout' })
      onDone(1)
    })
    const result = await runShareFolderHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.errorDetail).toBe('guest control failed')
  })

  it('falls back to the last non-empty line when no ERROR: line exists', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: 'Starting setup...', source: 'stdout' })
      onLine({ text: 'Mount failed unexpectedly', source: 'stdout' })
      onDone(1)
    })
    const result = await runShareFolderHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.errorDetail).toBe('Mount failed unexpectedly')
  })

  it('returns errorDetail: null when there are no output lines', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(1))
    const result = await runShareFolderHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.errorDetail).toBeNull()
  })
})

// ── run-share-logs handler ────────────────────────────────────────────────────

describe('run-share-logs handler', () => {
  let runShareLogsHandler
  let mockRunScript

  const PARAMS = { vmName: 'FedoraBox', hostPath: 'C:\\VMs\\FedoraBox\\guest-logs' }

  beforeAll(() => {
    mockRunScript = vi.fn()
    const srId = require.resolve('../script-runner')
    require.cache[srId] = {
      id: srId, filename: srId, loaded: true,
      exports: { runScript: mockRunScript, hasActiveScript: vi.fn(), killActiveScript: vi.fn(), setRunContext: vi.fn(), getScriptState: vi.fn(), clearScriptState: vi.fn() },
    }
    runShareLogsHandler = loadHandlers()('run-share-logs')
  })

  afterAll(() => {
    delete require.cache[require.resolve('../script-runner')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockRunScript.mockReset()
  })

  it('returns ok: true when the script exits 0', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    const result = await runShareLogsHandler({}, PARAMS)
    expect(result).toEqual({ ok: true })
  })

  it('returns errorDetail from the last ERROR: prefixed line on failure', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: 'ERROR: rsync failed', source: 'stdout' })
      onDone(1)
    })
    const result = await runShareLogsHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.errorDetail).toBe('rsync failed')
  })

  it('falls back to last non-empty line when no ERROR: line exists', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: 'Configuring rsync...', source: 'stdout' })
      onLine({ text: 'crontab write failed', source: 'stdout' })
      onDone(1)
    })
    const result = await runShareLogsHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.errorDetail).toBe('crontab write failed')
  })
})

// ── extractError — Script exited with code filtering ─────────────────────────

describe('extractError — Script exited with code filtering', () => {
  let runShareFolderHandler
  let mockRunScript

  const PARAMS = {
    vmName:     'FedoraBox',
    hostPath:   'C:\\Work\\shared',
    mountPoint: '/mnt/shared',
    vmUser:     'root',
    vmPass:     'secret',
    loginUser:  'fedora',
  }

  beforeAll(() => {
    mockRunScript = vi.fn()
    const srId = require.resolve('../script-runner')
    require.cache[srId] = {
      id: srId, filename: srId, loaded: true,
      exports: { runScript: mockRunScript, hasActiveScript: vi.fn(), killActiveScript: vi.fn(), setRunContext: vi.fn(), getScriptState: vi.fn(), clearScriptState: vi.fn() },
    }
    runShareFolderHandler = loadHandlers()('run-share-folder')
  })

  afterAll(() => {
    delete require.cache[require.resolve('../script-runner')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockRunScript.mockReset()
  })

  it('prefers a specific ERROR: line over the generic Script exited with code message', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: "ERROR: Desktop user 'badname' does not exist on this system.", source: 'stdout' })
      onLine({ text: '  ERROR: Script exited with code 1', source: 'stdout' })
      onDone(1)
    })
    const result = await runShareFolderHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.errorDetail).toBe("Desktop user 'badname' does not exist on this system.")
  })
})

// ── run-provision-script handler ──────────────────────────────────────────────

describe('run-provision-script handler', () => {
  let runProvisionScriptHandler
  let mockRunScript

  const PARAMS = {
    vmName:        'FedoraBox',
    vmUser:        'root',
    vmPass:        'secret',
    loginUser:     'fedora',
    scriptRelPath: 'tools/editors/vim.sh',
    scriptArgs:    'fedora',
  }

  beforeAll(() => {
    mockRunScript = vi.fn()
    const srId = require.resolve('../script-runner')
    require.cache[srId] = {
      id: srId, filename: srId, loaded: true,
      exports: { runScript: mockRunScript, hasActiveScript: vi.fn(), killActiveScript: vi.fn(), setRunContext: vi.fn(), getScriptState: vi.fn(), clearScriptState: vi.fn() },
    }
    runProvisionScriptHandler = loadHandlers()('run-provision-script')
  })

  afterAll(() => {
    delete require.cache[require.resolve('../script-runner')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockRunScript.mockReset()
  })

  it('returns ok: true when the script exits 0', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    const result = await runProvisionScriptHandler({}, PARAMS)
    expect(result).toEqual({ ok: true })
  })

  it('returns errorDetail from the last ERROR: prefixed line on failure', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: 'Installing vim...', source: 'stdout' })
      onLine({ text: 'ERROR: guest control failed', source: 'stdout' })
      onDone(1)
    })
    const result = await runProvisionScriptHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.errorDetail).toBe('guest control failed')
  })

  it('passes -ScriptArgs when params.scriptArgs is set', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    await runProvisionScriptHandler({}, PARAMS)
    const psArgs = mockRunScript.mock.calls[0][1]
    const idx = psArgs.indexOf('-ScriptArgs')
    expect(idx).toBeGreaterThan(-1)
    expect(psArgs[idx + 1]).toBe('fedora')
  })

  it('omits -ScriptArgs when params.scriptArgs is falsy', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    const paramsNoArgs = { ...PARAMS, scriptArgs: '' }
    await runProvisionScriptHandler({}, paramsNoArgs)
    const psArgs = mockRunScript.mock.calls[0][1]
    expect(psArgs).not.toContain('-ScriptArgs')
  })
})

// ── run-provision-setup handler ───────────────────────────────────────────────

describe('run-provision-setup handler', () => {
  let runProvisionSetupHandler
  let mockRunScript

  const PARAMS = {
    vmName:    'FedoraBox',
    vmUser:    'root',
    vmPass:    'secret',
    loginUser: 'fedora',
    hostname:  'myhost',
  }

  beforeAll(() => {
    mockRunScript = vi.fn()
    const srId = require.resolve('../script-runner')
    require.cache[srId] = {
      id: srId, filename: srId, loaded: true,
      exports: { runScript: mockRunScript, hasActiveScript: vi.fn(), killActiveScript: vi.fn(), setRunContext: vi.fn(), getScriptState: vi.fn(), clearScriptState: vi.fn() },
    }
    runProvisionSetupHandler = loadHandlers()('run-provision-setup')
  })

  afterAll(() => {
    delete require.cache[require.resolve('../script-runner')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockRunScript.mockReset()
  })

  it('returns ok: true when the script exits 0', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    const result = await runProvisionSetupHandler({}, PARAMS)
    expect(result).toEqual({ ok: true })
  })

  it('returns errorDetail from the last ERROR: prefixed line on failure', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: 'Running base setup...', source: 'stdout' })
      onLine({ text: 'ERROR: system prep failed', source: 'stdout' })
      onDone(1)
    })
    const result = await runProvisionSetupHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.errorDetail).toBe('system prep failed')
  })

  it('passes -Hostname in the PowerShell args', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    await runProvisionSetupHandler({}, PARAMS)
    const psArgs = mockRunScript.mock.calls[0][1]
    const idx = psArgs.indexOf('-Hostname')
    expect(idx).toBeGreaterThan(-1)
    expect(psArgs[idx + 1]).toBe('myhost')
  })
})

// ── get-vm-hostname handler ───────────────────────────────────────────────────

describe('get-vm-hostname handler', () => {
  let getVmHostnameHandler
  let mockExecSync

  const PARAMS = { vmName: 'FedoraBox', vmUser: 'root', vmPass: 'secret' }

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync, exec: vi.fn(), execFile: vi.fn() },
    }
    getVmHostnameHandler = loadHandlers()('get-vm-hostname')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  beforeEach(() => { mockExecSync.mockReset() })

  it('returns the trimmed hostname on success', async () => {
    mockExecSync.mockReturnValue('fedorabox\n')
    const result = await getVmHostnameHandler({}, PARAMS)
    expect(result).toEqual({ ok: true, hostname: 'fedorabox' })
  })

  it('includes the VM name in the VBoxManage command', async () => {
    mockExecSync.mockReturnValue('fedorabox\n')
    await getVmHostnameHandler({}, PARAMS)
    expect(mockExecSync.mock.calls[0][0]).toContain('FedoraBox')
  })

  it('returns ok: false when VBoxManage throws', async () => {
    mockExecSync.mockImplementation(() => { const e = new Error('VM not found'); e.stderr = 'VM not found'; throw e })
    const result = await getVmHostnameHandler({}, PARAMS)
    expect(result).toEqual({ ok: false, error: 'VM not found' })
  })
})

// ── check-vm-credentials handler ─────────────────────────────────────────────

describe('check-vm-credentials handler', () => {
  let checkVmCredsHandler
  let mockExecSync

  const PARAMS = { vmName: 'FedoraBox', vmUser: 'root', vmPass: 'secret' }

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync, exec: vi.fn(), execFile: vi.fn() },
    }
    checkVmCredsHandler = loadHandlers()('check-vm-credentials')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  beforeEach(() => { mockExecSync.mockReset() })

  it('returns ok: true, isLive: false when credentials are valid and the live directory is absent', async () => {
    mockExecSync.mockReturnValueOnce('ok\n')
    mockExecSync.mockImplementationOnce(() => { throw new Error('exit 1') })
    const result = await checkVmCredsHandler({}, PARAMS)
    expect(result).toEqual({ ok: true, isLive: false })
  })

  it('returns ok: true, isLive: true when the live OS directory exists', async () => {
    mockExecSync.mockReturnValueOnce('ok\n')
    mockExecSync.mockReturnValueOnce('')
    const result = await checkVmCredsHandler({}, PARAMS)
    expect(result).toEqual({ ok: true, isLive: true })
  })

  it('returns ok: false when credentials are wrong, using stderr for the error message', async () => {
    const err = new Error('Authentication failed')
    err.stderr = 'VBoxManage: error: Could not authenticate'
    mockExecSync.mockImplementation(() => { throw err })
    const result = await checkVmCredsHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('VBoxManage: error: Could not authenticate')
  })

  it('falls back to error.message when stderr is absent', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('Timed out') })
    const result = await checkVmCredsHandler({}, PARAMS)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Timed out')
  })

  it('returns "Connection failed" when no error detail is available', async () => {
    const err = new Error('')
    mockExecSync.mockImplementation(() => { throw err })
    const result = await checkVmCredsHandler({}, PARAMS)
    expect(result).toEqual({ ok: false, error: 'Connection failed' })
  })
})

// ── run-sanity-checks handler ─────────────────────────────────────────────────

describe('run-sanity-checks handler', () => {
  let runSanityChecksHandler
  let mockRunScript

  const sampleChecks = [
    { id: 'ram', label: 'RAM', status: 'pass', detail: '16 GB' },
  ]

  beforeAll(() => {
    mockRunScript = vi.fn()
    const srId = require.resolve('../script-runner')
    require.cache[srId] = {
      id: srId, filename: srId, loaded: true,
      exports: { runScript: mockRunScript, hasActiveScript: vi.fn(), killActiveScript: vi.fn(), setRunContext: vi.fn(), getScriptState: vi.fn(), clearScriptState: vi.fn() },
    }
    runSanityChecksHandler = loadHandlers()('run-sanity-checks')
  })

  afterAll(() => {
    delete require.cache[require.resolve('../script-runner')]
    cleanupHandlers()
  })

  beforeEach(() => { mockRunScript.mockReset() })

  it('returns ok: true with parsed checks when the script succeeds', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: JSON.stringify(sampleChecks), source: 'stdout' })
      onDone(0)
    })
    const result = await runSanityChecksHandler({})
    expect(result.ok).toBe(true)
    expect(result.checks).toEqual(sampleChecks)
  })

  it('passes -Json to the script', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: JSON.stringify(sampleChecks), source: 'stdout' })
      onDone(0)
    })
    await runSanityChecksHandler({})
    expect(mockRunScript.mock.calls[0][1]).toContain('-Json')
  })

  it('returns ok: false with checks: [] when output cannot be parsed', async () => {
    mockRunScript.mockImplementation((_p, _a, onLine, onDone) => {
      onLine({ text: 'not json output at all', source: 'stdout' })
      onDone(1)
    })
    const result = await runSanityChecksHandler({})
    expect(result.ok).toBe(false)
    expect(result.checks).toEqual([])
    expect(result.error).toMatch(/Could not parse/)
  })
})

// ── create-vm handler ─────────────────────────────────────────────────────────

describe('create-vm handler', () => {
  let createVmHandler
  let mockRunScript

  const PARAMS = {
    vmName:              'FedoraBox',
    isoPath:             'C:\\Downloads\\fedora.iso',
    ramMB:               4096,
    cpus:                2,
    diskMB:              30720,
    diskType:            'dynamic',
    vramMB:              128,
    nicType:             'nat',
    attachGuestAdditions: true,
    startVm:             true,
    forceRecreate:       false,
  }

  beforeAll(() => {
    mockRunScript = vi.fn()
    const srId = require.resolve('../script-runner')
    require.cache[srId] = {
      id: srId, filename: srId, loaded: true,
      exports: { runScript: mockRunScript, hasActiveScript: vi.fn(), killActiveScript: vi.fn(), setRunContext: vi.fn(), getScriptState: vi.fn(), clearScriptState: vi.fn() },
    }
    createVmHandler = loadHandlers()('create-vm')
  })

  afterAll(() => {
    delete require.cache[require.resolve('../script-runner')]
    cleanupHandlers()
  })

  beforeEach(() => { mockRunScript.mockReset() })

  it('returns ok: true when the script exits 0', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    const result = await createVmHandler({}, PARAMS)
    expect(result).toEqual({ ok: true })
  })

  it('returns ok: false when the script exits non-zero', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(1))
    const result = await createVmHandler({}, PARAMS)
    expect(result).toEqual({ ok: false })
  })

  it('passes -vmName and -isoPath in the PowerShell args', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    await createVmHandler({}, PARAMS)
    const psArgs = mockRunScript.mock.calls[0][1]
    expect(psArgs).toContain('-vmName')
    expect(psArgs).toContain('FedoraBox')
    expect(psArgs).toContain('-isoPath')
    expect(psArgs).toContain('C:\\Downloads\\fedora.iso')
  })

  it('passes -vmFolder when provided', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    await createVmHandler({}, { ...PARAMS, vmFolder: 'D:\\VMs' })
    const psArgs = mockRunScript.mock.calls[0][1]
    expect(psArgs).toContain('-vmFolder')
    expect(psArgs).toContain('D:\\VMs')
  })

  it('omits -vmFolder when not provided', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    await createVmHandler({}, PARAMS)
    const psArgs = mockRunScript.mock.calls[0][1]
    expect(psArgs).not.toContain('-vmFolder')
  })
})

// ── install-virtualbox handler ────────────────────────────────────────────────

describe('install-virtualbox handler', () => {
  let installVirtualBoxHandler
  let mockRunScript

  beforeAll(() => {
    mockRunScript = vi.fn()
    const srId = require.resolve('../script-runner')
    require.cache[srId] = {
      id: srId, filename: srId, loaded: true,
      exports: { runScript: mockRunScript, hasActiveScript: vi.fn(), killActiveScript: vi.fn(), setRunContext: vi.fn(), getScriptState: vi.fn(), clearScriptState: vi.fn() },
    }
    installVirtualBoxHandler = loadHandlers()('install-virtualbox')
  })

  afterAll(() => {
    delete require.cache[require.resolve('../script-runner')]
    cleanupHandlers()
  })

  beforeEach(() => { mockRunScript.mockReset() })

  it('returns ok: true when the script exits 0', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(0))
    const result = await installVirtualBoxHandler({})
    expect(result).toEqual({ ok: true })
  })

  it('returns ok: false when the script exits non-zero', async () => {
    mockRunScript.mockImplementation((_p, _a, _onLine, onDone) => onDone(1))
    const result = await installVirtualBoxHandler({})
    expect(result).toEqual({ ok: false })
  })
})

// ── log-error handler ─────────────────────────────────────────────────────────

describe('log-error handler', () => {
  let logErrorHandler
  let mockLogError

  beforeAll(() => {
    mockLogError = vi.fn()
    const logId = require.resolve('../logger')
    const loggerStub = {
      id: logId, filename: logId, loaded: true,
      exports: {
        LOG_DIR:  'C:\\fake\\logs',
        info:     vi.fn(),
        warn:     vi.fn(),
        error:    mockLogError,
        hostLine: vi.fn(),
        hostMark: vi.fn(),
      },
    }
    logErrorHandler = loadHandlers({}, { [logId]: loggerStub })('log-error')
  })

  afterAll(() => {
    cleanupHandlers([require.resolve('../logger')])
  })

  beforeEach(() => { mockLogError.mockReset() })

  it('logs the error message', async () => {
    await logErrorHandler({}, 'Something went wrong', 'Error: at line 1')
    expect(mockLogError).toHaveBeenCalledWith('[renderer] uncaught error:', 'Something went wrong')
  })

  it('logs the stack trace when provided', async () => {
    await logErrorHandler({}, 'Something went wrong', 'Error: at line 1')
    expect(mockLogError).toHaveBeenCalledWith('[renderer] stack:', 'Error: at line 1')
  })

  it('does not log a stack line when stack is null', async () => {
    await logErrorHandler({}, 'Something went wrong', null)
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect(mockLogError).toHaveBeenCalledWith('[renderer] uncaught error:', 'Something went wrong')
  })
})
