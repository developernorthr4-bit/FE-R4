import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, RequireRole } from './components/require-auth'
import { AuthProvider } from './lib/auth-context'
import { ThemeProvider } from './lib/theme-context'
import DashboardPage from './routes/dashboard'
import LoginPage from './routes/login'
import RegisterPage from './routes/register'
import ResetPasswordPage from './routes/reset-password'
import UsersPage from './routes/users'

export default function App() {
  return (
    // ThemeProvider อยู่นอกสุด — หน้า login ต้องสลับธีมได้ตั้งแต่ยังไม่ล็อกอิน
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* เปิดสาธารณะ — เข้าได้ตั้งแต่ยังไม่ล็อกอิน */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/users"
            element={
              <RequireRole min="admin">
                <UsersPage />
              </RequireRole>
            }
          />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}
