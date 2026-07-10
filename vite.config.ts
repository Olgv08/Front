import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Todo App',
        short_name: 'todo',
        description: 'Organiza tus tareas de manera eficiente',
        start_url: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3f51b5',
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
            src: '/screenshots/captura2.png',
            sizes: '1902x990',
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