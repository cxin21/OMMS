import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 从环境变量读取端口，默认3456
const PORT = parseInt(process.env.OMMS_WEB_UI_PORT || '3456')

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    host: true
  }
})
