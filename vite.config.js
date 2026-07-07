import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const appBuilderOutDir = 'src/universal-editor-ui-1/dist/web-prod'

function readHttpsCerts() {
  try {
    return {
      key: readFileSync(fileURLToPath(new URL('./certs/key.pem', import.meta.url))),
      cert: readFileSync(fileURLToPath(new URL('./certs/cert.pem', import.meta.url))),
    }
  } catch {
    return undefined
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '')
  const https = readHttpsCerts()

  return {
    base: './',
    build: {
      outDir: appBuilderOutDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: `${root}/index.html`,
          rail: `${root}/rail.html`,
          dev: `${root}/dev.html`,
          modal: `${root}/modal.html`,
        },
      },
    },
    define: {
      'import.meta.env.VITE_TFS_FORM_APP_URL': JSON.stringify(
        env.VITE_TFS_FORM_APP_URL || '',
      ),
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
  }
})
