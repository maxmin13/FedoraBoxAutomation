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
  let mockReadFileSync

  beforeAll(() => {
    // Spy on fs.readFileSync before reloading the module so the fresh load picks up the spy
    mockReadFileSync = vi.spyOn(fs, 'readFileSync')
    readDocHandler = loadHandlers()('read-doc')
  })

  afterAll(() => {
    mockReadFileSync.mockRestore()
    cleanupHandlers()
  })

  it('returns ok: true with the file content when the file exists', async () => {
    mockReadFileSync.mockReturnValueOnce('# My Doc\nSome content.')
    const result = await readDocHandler({}, 'README.md')
    expect(result).toEqual({ ok: true, content: '# My Doc\nSome content.' })
  })

  it('returns ok: false with an error message when the file does not exist', async () => {
    mockReadFileSync.mockImplementationOnce(() => { throw new Error('ENOENT: no such file or directory') })
    const result = await readDocHandler({}, 'missing.md')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/missing\.md/)
  })

  it('reads from the docs/ directory (path does not traverse outside the repo)', async () => {
    mockReadFileSync.mockReturnValueOnce('')
    await readDocHandler({}, 'SETUP.md')
    const calledPath = mockReadFileSync.mock.calls.at(-1)[0]
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
    expect(result).toEqual({ ok: false })
  })

  it('returns ok: false when the credentials file does not exist', async () => {
    mockReadFile.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const result = await loadCredsHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: false })
  })

  it('strips the UTF-8 BOM that PowerShell 5.1 writes', async () => {
    const bom = '﻿'
    mockReadFile.mockResolvedValueOnce(bom + JSON.stringify(CREDS_STORE))
    const result = await loadCredsHandler({}, 'FedoraBox')
    expect(result.ok).toBe(true)
    expect(result.user).toBe('root')
  })

  it('returns empty strings for missing optional credential fields', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ FedoraBox: {} }))
    const result = await loadCredsHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true, user: '', pass: '', loginUser: '' })
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
    const written = JSON.parse(mockWriteFile.mock.calls.at(-1)[1])
    expect(written.FedoraBox).toEqual({ user: 'root', pass: 'pw', loginUser: 'alice' })
  })

  it('merges with existing entries rather than overwriting them', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ OtherVM: { user: 'admin', pass: 'x', loginUser: 'y' } }))
    await saveCredsHandler({}, { vmName: 'FedoraBox', user: 'root', pass: 'pw', loginUser: 'alice' })
    const written = JSON.parse(mockWriteFile.mock.calls.at(-1)[1])
    expect(written.OtherVM).toBeDefined()
    expect(written.FedoraBox).toBeDefined()
  })

  it('creates the credentials directory if it does not exist', async () => {
    mockReadFile.mockResolvedValueOnce('{}')
    await saveCredsHandler({}, { vmName: 'FedoraBox', user: 'root', pass: 'pw', loginUser: 'alice' })
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('.credentials'), { recursive: true })
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
      exports: { execSync: mockExecSync },
    }
    checkVmReadyHandler = loadHandlers()('check-vm-ready')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  it('returns running: false when VM is stopped', async () => {
    mockExecSync.mockReturnValueOnce('VMState="poweroff"\n')
    const result = await checkVmReadyHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true, running: false, guestAdditions: false })
  })

  it('returns running: true and guestAdditions: true when GA version is present', async () => {
    mockExecSync
      .mockReturnValueOnce('VMState="running"\n')           // showvminfo
      .mockReturnValueOnce('Value: 7.0.14\n')              // guestproperty
    const result = await checkVmReadyHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true, running: true, guestAdditions: true, version: '7.0.14' })
  })

  it('returns running: true and guestAdditions: false when GA property is absent', async () => {
    mockExecSync
      .mockReturnValueOnce('VMState="running"\n')
      .mockImplementationOnce(() => { throw new Error('No value set') })
    const result = await checkVmReadyHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true, running: true, guestAdditions: false })
  })

  it('returns ok: false when VBoxManage throws', async () => {
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

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync },
    }
    listVmsHandler = loadHandlers()('list-vms')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExecSync.mockReset()
  })

  it('returns all VMs with the running field set correctly', async () => {
    mockExecSync
      .mockReturnValueOnce('"FedoraBox" {uuid-1}\n"OtherVM" {uuid-2}\n') // list vms
      .mockReturnValueOnce('"FedoraBox" {uuid-1}\n')                       // list runningvms
    const result = await listVmsHandler({})
    expect(result.ok).toBe(true)
    expect(result.vms).toEqual([
      { name: 'FedoraBox', uuid: 'uuid-1', running: true },
      { name: 'OtherVM',   uuid: 'uuid-2', running: false },
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

describe('start-vm handler', () => {
  let startVmHandler
  let mockExecSync

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync },
    }
    startVmHandler = loadHandlers()('start-vm')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExecSync.mockReset()
  })

  it('returns ok: true without calling startvm when VM is already running', async () => {
    mockExecSync.mockReturnValueOnce('VMState="running"\n') // isVmRunning
    const result = await startVmHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true })
    // Only the showvminfo call, not startvm
    expect(mockExecSync).toHaveBeenCalledTimes(1)
  })

  it('calls VBoxManage startvm --type gui when VM is stopped', async () => {
    mockExecSync
      .mockReturnValueOnce('VMState="poweroff"\n') // isVmRunning
      .mockReturnValueOnce('')                      // startvm
    const result = await startVmHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true })
    expect(mockExecSync).toHaveBeenLastCalledWith(
      expect.stringContaining('startvm'),
      expect.anything()
    )
  })

  it('returns ok: false when VBoxManage startvm throws', async () => {
    mockExecSync
      .mockReturnValueOnce('VMState="poweroff"\n')
      .mockImplementationOnce(() => { throw new Error('VM not found') })
    const result = await startVmHandler({}, 'FedoraBox')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/VM not found/)
  })
})

// ── delete-vm handler ─────────────────────────────────────────────────────────

describe('delete-vm handler', () => {
  let deleteVmHandler
  let mockExecSync
  let mockReadFile, mockMkdir, mockWriteFile

  beforeAll(() => {
    const cpId = require.resolve('child_process')
    mockExecSync = vi.fn()
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { execSync: mockExecSync },
    }
    mockReadFile  = vi.spyOn(fs.promises, 'readFile')
    mockMkdir     = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
    mockWriteFile = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
    deleteVmHandler = loadHandlers()('delete-vm')
  })

  afterAll(() => {
    delete require.cache[require.resolve('child_process')]
    mockReadFile.mockRestore()
    mockMkdir.mockRestore()
    mockWriteFile.mockRestore()
    cleanupHandlers()
  })

  beforeEach(() => {
    mockExecSync.mockReset()
    mockReadFile.mockReset()
    mockWriteFile.mockClear()
  })

  it('calls VBoxManage unregistervm --delete', async () => {
    mockExecSync.mockReturnValueOnce('')
    mockReadFile.mockResolvedValueOnce('{}')
    await deleteVmHandler({}, 'FedoraBox')
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('unregistervm'),
      expect.anything()
    )
  })

  it('returns ok: true on success', async () => {
    mockExecSync.mockReturnValueOnce('')
    mockReadFile.mockResolvedValueOnce('{}')
    const result = await deleteVmHandler({}, 'FedoraBox')
    expect(result).toEqual({ ok: true })
  })

  it('removes saved credentials for the deleted VM', async () => {
    mockExecSync.mockReturnValueOnce('')
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ FedoraBox: { user: 'root', pass: 'x', loginUser: 'y' } })
    )
    await deleteVmHandler({}, 'FedoraBox')
    const written = JSON.parse(mockWriteFile.mock.calls.at(-1)[1])
    expect(written.FedoraBox).toBeUndefined()
  })

  it('returns ok: false when VBoxManage unregistervm throws', async () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error('VM is locked') })
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
      exports: { execSync: mockExecSync },
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
