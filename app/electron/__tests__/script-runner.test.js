const { splitChunk } = require('../script-runner')

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
