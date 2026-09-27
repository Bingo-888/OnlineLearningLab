import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { applyTheme, getTheme } from './lib/theme'

applyTheme(getTheme())

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

// 有意的选择：不用 <StrictMode>。开发模式下它会双跑 effect，
// 让 epub.js / pdf.js 这类"创建实例 + iframe/canvas"的组件出现难以排查的重复挂载问题。
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
