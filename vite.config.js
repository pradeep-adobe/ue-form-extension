import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const https = {
  key: readFileSync(fileURLToPath(new URL('./certs/key.pem', import.meta.url))),
  cert: readFileSync(fileURLToPath(new URL('./certs/cert.pem', import.meta.url))),
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: `${root}/index.html`,
        rail: `${root}/rail.html`,
        dev: `${root}/dev.html`,
      },
    },
  },
  server: {
    host: 'localhost',
    port: 9080,
    https,
  },
  preview: {
    host: 'localhost',
    port: 9080,
    https,
  },
})
