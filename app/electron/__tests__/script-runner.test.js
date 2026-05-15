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
