import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, RequireRole } from './components/require-auth'
import { AuthProvider } from './lib/auth-context'
import { ThemeProvider } from './lib/theme-context'
import DashboardPage from './routes/dashboard'
import EventFormPage from './routes/event-form'
import EventsPage from './routes/events'
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
            element={<RequireAuth><DashboardPage /></RequireAuth>}
          />

          {/*
            ทุก role ที่ล็อกอินแล้วเข้าดูได้ — viewer เห็นทุกจังหวัดตามที่ตกลงกันไว้
            ปุ่มบันทึก/แก้ไขในหน้าจะซ่อนเองถ้า role ไม่ถึง editor และ BE กันซ้ำอีกชั้น
            /events/new ต้องมาก่อน /events/:id ไม่งั้น "new" จะถูกจับเป็น id
          */}
          <Route path="/events" element={<RequireAuth><EventsPage /></RequireAuth>} />
          <Route path="/events/new" element={<RequireAuth><EventFormPage /></RequireAuth>} />
          <Route path="/events/:id" element={<RequireAuth><EventFormPage /></RequireAuth>} />

          <Route
            path="/users"
            element={<RequireRole min="admin"><UsersPage /></RequireRole>}
          />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}
