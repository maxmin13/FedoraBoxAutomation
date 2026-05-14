vi.mock('electron')

const { parseVmList, parseChecksOutput } = require('../ipc-handlers')

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
    // Defensive guard: if somehow JSON.parse returns an object instead of an
    // array, the function wraps it so callers always receive an array.
    // Simulate by injecting a one-element array as the bracket content so the
    // bracket-finder passes, but patch JSON.parse to return a plain object.
    const single = sampleChecks[0]
    const original = JSON.parse
    JSON.parse = () => single
    try {
      const result = parseChecksOutput([`[placeholder]`])
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([single])
    } finally {
      JSON.parse = original
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
