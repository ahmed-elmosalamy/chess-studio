import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  main: {
    build: {
      lib: { entry: fileURLToPath(new URL('./src/main/index.ts', import.meta.url)) }
    },
    resolve: {
      alias: { '@shared': `${src}/shared` }
    }
  },
  preload: {
    build: {
      lib: { entry: fileURLToPath(new URL('./src/preload/index.ts', import.meta.url)) }
    },
    resolve: {
      alias: { '@shared': `${src}/shared` }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': `${src}/shared`,
        '@': `${src}/renderer/src`
      }
    }
  }
})
