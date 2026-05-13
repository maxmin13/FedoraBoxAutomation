import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    // React component tests — inherits jsdom environment and jest-dom setup
    extends: './vitest.config.ts',
    test: {
      name: 'react',
      include: ['src/__tests__/**/*.test.{ts,tsx}'],
    },
  },
  {
    // Electron pure-logic tests — plain Node, no DOM, no Electron runtime needed
    test: {
      name: 'electron',
      include: ['electron/__tests__/**/*.test.js'],
      environment: 'node',
      globals: true,
    },
  },
])
