import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getUser } from './lib/api'
import LoginPage from './pages/LoginPage'
import ChangePinPage from './pages/ChangePinPage'
import CrewDashboard from './pages/CrewDashboard'
import AdminDashboard from './pages/AdminDashboard'

function RequireAuth({ children, role }: { children: React.ReactNode; role?: 'crew' | 'admin' }) {
  const user = getUser()
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePin) return <Navigate to="/change-pin" replace />
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/crew'} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-pin" element={<ChangePinPage />} />
        <Route path="/crew" element={
          <RequireAuth role="crew"><CrewDashboard /></RequireAuth>
        } />
        <Route path="/admin" element={
          <RequireAuth role="admin"><AdminDashboard /></RequireAuth>
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
