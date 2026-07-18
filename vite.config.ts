import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TodoFlow',
        short_name: 'TodoFlow',
        description: 'Organiza tus tareas de manera eficiente',
        start_url: './',
        display: 'standalone',
        background_color: '#F3F1EC',
        theme_color: '#F3F1EC',
        icons: [
          {
            src: 'icons/icon192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon512.png',
            sizes: '512x512',
            type: 'image/png'
          },
        ],
        screenshots: [
          {
            src: '/screenshots/CapturaPantalla.png',
            sizes: '1917x1030',
            type: 'image/png'
          }
        ],
      },
        devOptions: {
          enabled: true
        }
    })
  ]
})