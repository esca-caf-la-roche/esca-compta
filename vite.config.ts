import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/esca-compta/', // Ajouté pour que le site fonctionne sur GitHub Pages
})
