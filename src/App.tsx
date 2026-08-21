import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/require-auth'
import { AuthProvider } from './lib/auth-context'
import { ThemeProvider } from './lib/theme-context'
import DashboardPage from './routes/dashboard'
import LoginPage from './routes/login'

export default function App() {
  return (
    // ThemeProvider อยู่นอกสุด — หน้า login ต้องสลับธีมได้ตั้งแต่ยังไม่ล็อกอิน
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}
