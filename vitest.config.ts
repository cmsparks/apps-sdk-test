
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    target: 'es2022', // Transpile using syntax for browser compatibility
  },
  test: {
    globalSetup: ['test/node-server-fixture.ts'],
    projects: [
      // Node.js
      {
        test: {
          name: 'node',
          include: ['./test/serialize-react.spec.tsx'],
          environment: 'node',
        },
      },
    ],
  },
})