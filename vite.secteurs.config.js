import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Build dédié du déploiement "Secteurs" (formateurs).
// Sort la page secteurs comme index.html dans dist-secteurs/, pour qu'un projet
// Vercel séparé la serve à la racine sans toucher au build principal.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'secteurs-as-index',
      closeBundle() {
        var dir = resolve(process.cwd(), 'dist-secteurs')
        var src = resolve(dir, 'secteurs.html')
        if (existsSync(src)) copyFileSync(src, resolve(dir, 'index.html'))
      },
    },
  ],
  base: '/',
  build: {
    outDir: 'dist-secteurs',
    rollupOptions: {
      input: resolve(process.cwd(), 'secteurs.html'),
    },
  },
})
