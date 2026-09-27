import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './auth/LoginPage'
import { RegisterPage } from './auth/RegisterPage'
import { LibraryPage } from './pages/LibraryPage'
import { ReaderPage } from './pages/ReaderPage'
import { AdminPage } from './pages/AdminPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/library', element: <RequireAuth><LibraryPage /></RequireAuth> },
  { path: '/book/:id', element: <RequireAuth><ReaderPage /></RequireAuth> },
  { path: '/admin', element: <RequireAuth adminOnly><AdminPage /></RequireAuth> },
  { path: '*', element: <Navigate to="/library" replace /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
