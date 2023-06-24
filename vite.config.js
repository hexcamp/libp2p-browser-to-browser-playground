import path from 'path'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

/*
export default {
  build: {
    target: 'es2022'
  },
  optimizeDeps: {
    esbuildOptions: { target: 'es2022', supported: { bigint: true } }
  },
  server: {
    open: true
  }
}
*/

export default defineConfig({
  build: {
    target: 'es2022'
  },
  optimizeDeps: {
    esbuildOptions: { target: 'es2022', supported: { bigint: true } }
  },
  server: {
    https: true,
    host: true
  },
  plugins: [
    mkcert(),
  ],
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(__dirname, '/src') }]
  }
})
