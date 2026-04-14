import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const targets = process.env.EV_BUILD_TARGET
  ? process.env.EV_BUILD_TARGET.split(',').map((t) => t.trim()).filter(Boolean)
  : ['main', 'preload', 'renderer']

const shouldBuildMain = targets.includes('main') || targets.includes('all')
const shouldBuildPreload = targets.includes('preload') || targets.includes('all')
const shouldBuildRenderer = targets.includes('renderer') || targets.includes('all')

export default defineConfig({
  cacheDir: '.vite/build-cache',
  ...(shouldBuildMain
    ? {
        main: {
          plugins: [externalizeDepsPlugin()],
          resolve: {
            alias: {
              '@shared': resolve(__dirname, 'src/shared'),
            },
          },
          build: {
            outDir: 'dist-electron/main',
            minify: false,
            rollupOptions: {
              input: resolve(__dirname, 'src/main/index.ts'),
              external: ['node-pty'],
              treeshake: false,
            },
          },
        },
      }
    : {}),
  ...(shouldBuildPreload
    ? {
        preload: {
          plugins: [externalizeDepsPlugin()],
          resolve: {
            alias: {
              '@shared': resolve(__dirname, 'src/shared'),
            },
          },
          build: {
            outDir: 'dist-electron/preload',
            minify: false,
            rollupOptions: {
              input: resolve(__dirname, 'src/preload/index.ts'),
              treeshake: false,
            },
          },
        },
      }
    : {}),
  ...(shouldBuildRenderer
    ? {
        renderer: {
          root: resolve(__dirname, 'src/renderer'),
          resolve: {
            alias: {
              '@': resolve(__dirname, 'src/renderer/src'),
              '@shared': resolve(__dirname, 'src/shared'),
            },
          },
          plugins: [react()],
          build: {
            outDir: 'dist-electron/renderer',
            modulePreload: false,
            reportCompressedSize: false,
          },
          optimizeDeps: {
            noDiscovery: true,
            include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
            exclude: ['@xterm/xterm', '@xterm/addon-fit'],
          },
        },
      }
    : {}),
})
