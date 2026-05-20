const { splitChunk, hasActiveScript, killActiveScript } = require('../script-runner')

// ── splitChunk ───────────────────────────────────────────────────────────────

describe('splitChunk', () => {
  it('splits LF-delimited lines', () => {
    const result = splitChunk('line one\nline two\nline three', 'stdout')
    expect(result).toEqual([
      { text: 'line one',   source: 'stdout' },
      { text: 'line two',   source: 'stdout' },
      { text: 'line three', source: 'stdout' },
    ])
  })

  it('splits CRLF-delimited lines', () => {
    const result = splitChunk('line one\r\nline two\r\nline three', 'stdout')
    expect(result).toEqual([
      { text: 'line one',   source: 'stdout' },
      { text: 'line two',   source: 'stdout' },
      { text: 'line three', source: 'stdout' },
    ])
  })

  it('filters out empty lines', () => {
    const result = splitChunk('first\n\nsecond', 'stdout')
    expect(result).toEqual([
      { text: 'first',  source: 'stdout' },
      { text: 'second', source: 'stdout' },
    ])
  })

  it('filters out whitespace-only lines', () => {
    const result = splitChunk('first\n   \nsecond', 'stdout')
    expect(result).toEqual([
      { text: 'first',  source: 'stdout' },
      { text: 'second', source: 'stdout' },
    ])
  })

  it('does not produce a spurious empty line from a trailing newline', () => {
    // PS1 scripts always end their output with \n — the last split segment must be dropped.
    const result = splitChunk('line one\nline two\n', 'stdout')
    expect(result).toEqual([
      { text: 'line one', source: 'stdout' },
      { text: 'line two', source: 'stdout' },
    ])
  })

  it('tags each line with the given source', () => {
    const result = splitChunk('an error line', 'stderr')
    expect(result).toEqual([{ text: 'an error line', source: 'stderr' }])
  })

  it('returns an empty array for a blank chunk', () => {
    expect(splitChunk('', 'stdout')).toEqual([])
    expect(splitChunk('\n\n\r\n', 'stdout')).toEqual([])
  })

  it('accepts a Buffer as well as a string', () => {
    const result = splitChunk(Buffer.from('buffered line'), 'stdout')
    expect(result).toEqual([{ text: 'buffered line', source: 'stdout' }])
  })
})

// ── hasActiveScript ──────────────────────────────────────────────────────────

describe('hasActiveScript', () => {
  it('returns false when no script has been started', () => {
    expect(hasActiveScript()).toBe(false)
  })
})

// ── killActiveScript ─────────────────────────────────────────────────────────

describe('killActiveScript', () => {
  it('does not throw when called with no active script', () => {
    expect(() => killActiveScript()).not.toThrow()
  })

  it('leaves hasActiveScript false after a no-op kill', () => {
    killActiveScript()
    expect(hasActiveScript()).toBe(false)
  })
})

// ── runScript ─────────────────────────────────────────────────────────────────
// These tests reload script-runner with a mocked child_process each time
// so spawn() is intercepted.

describe('runScript', () => {
  let runScript_mod
  let mockSpawn
  let mockChild
  let stdoutHandlers, stderrHandlers, childHandlers

  beforeEach(() => {
    stdoutHandlers = {}
    stderrHandlers = {}
    childHandlers  = {}

    mockChild = {
      pid:    1234,
      stdout: { on: vi.fn((ev, h) => { stdoutHandlers[ev] = h }) },
      stderr: { on: vi.fn((ev, h) => { stderrHandlers[ev] = h }) },
      on:     vi.fn((ev, h) => { childHandlers[ev]  = h }),
    }
    mockSpawn = vi.fn().mockReturnValue(mockChild)

    const cpId = require.resolve('child_process')
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { spawn: mockSpawn },
    }

    delete require.cache[require.resolve('../script-runner')]
    runScript_mod = require('../script-runner').runScript
  })

  afterEach(() => {
    delete require.cache[require.resolve('child_process')]
    delete require.cache[require.resolve('../script-runner')]
  })

  it('spawns powershell with -ExecutionPolicy Bypass -File <path> and extra args', () => {
    runScript_mod('C:\\scripts\\test.ps1', ['-Arg', 'val'], vi.fn(), vi.fn())
    expect(mockSpawn).toHaveBeenCalledWith('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-File', 'C:\\scripts\\test.ps1',
      '-Arg', 'val',
    ])
  })

  it('calls onLine with each stdout line tagged source: stdout', () => {
    const onLine = vi.fn()
    runScript_mod('/script.ps1', [], onLine, vi.fn())
    stdoutHandlers['data']('line one\nline two\n')
    expect(onLine).toHaveBeenCalledTimes(2)
    expect(onLine).toHaveBeenCalledWith({ text: 'line one', source: 'stdout' })
    expect(onLine).toHaveBeenCalledWith({ text: 'line two', source: 'stdout' })
  })

  it('calls onLine with stderr lines tagged source: stderr', () => {
    const onLine = vi.fn()
    runScript_mod('/script.ps1', [], onLine, vi.fn())
    stderrHandlers['data']('error output\n')
    expect(onLine).toHaveBeenCalledWith({ text: 'error output', source: 'stderr' })
  })

  it('calls onDone with the process exit code on close', () => {
    const onDone = vi.fn()
    runScript_mod('/script.ps1', [], vi.fn(), onDone)
    childHandlers['close'](0)
    expect(onDone).toHaveBeenCalledWith(0)
  })

  it('uses exit code 1 when the close event reports null (process was killed)', () => {
    const onDone = vi.fn()
    runScript_mod('/script.ps1', [], vi.fn(), onDone)
    childHandlers['close'](null)
    expect(onDone).toHaveBeenCalledWith(1)
  })

  it('emits an ERROR line and calls onDone(1) when the process fails to start', () => {
    const onLine = vi.fn()
    const onDone = vi.fn()
    runScript_mod('/script.ps1', [], onLine, onDone)
    childHandlers['error'](new Error('powershell not found'))
    expect(onLine).toHaveBeenCalledWith(expect.objectContaining({
      source: 'stderr',
      text:   expect.stringContaining('ERROR'),
    }))
    expect(onDone).toHaveBeenCalledWith(1)
  })
})

// ── killActiveScript with an active process ────────────────────────────────────

describe('killActiveScript with an active process', () => {
  let runScript_mod
  let killActiveScript_mod
  let hasActiveScript_mod
  let mockSpawn
  let mockChild

  beforeEach(() => {
    mockChild = {
      pid:    9999,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on:     vi.fn(),
    }
    mockSpawn = vi.fn().mockReturnValue(mockChild)

    const cpId = require.resolve('child_process')
    require.cache[cpId] = {
      id: cpId, filename: cpId, loaded: true,
      exports: { spawn: mockSpawn },
    }

    delete require.cache[require.resolve('../script-runner')]
    const mod        = require('../script-runner')
    runScript_mod        = mod.runScript
    killActiveScript_mod = mod.killActiveScript
    hasActiveScript_mod  = mod.hasActiveScript
  })

  afterEach(() => {
    delete require.cache[require.resolve('child_process')]
    delete require.cache[require.resolve('../script-runner')]
  })

  it('calls taskkill /T /F with the active process PID', () => {
    runScript_mod('/script.ps1', [], vi.fn(), vi.fn())
    expect(hasActiveScript_mod()).toBe(true)

    mockSpawn.mockClear()
    killActiveScript_mod()

    expect(mockSpawn).toHaveBeenCalledWith('taskkill', ['/PID', '9999', '/T', '/F'])
  })

  it('sets hasActiveScript to false after the kill', () => {
    runScript_mod('/script.ps1', [], vi.fn(), vi.fn())
    killActiveScript_mod()
    expect(hasActiveScript_mod()).toBe(false)
  })
})
