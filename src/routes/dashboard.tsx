import { Link } from 'react-router-dom'
import { AppLayout, PageHeader } from '../components/app-layout'
import { Button, Card } from '../components/ui'
import { useAuth } from '../lib/auth-context'
import { atLeast, ROLE_LABEL } from '../lib/roles'

/** หน้าหลังล็อกอิน — ยังไม่มีตัวเลขสรุป รอโมดูลรายงานรายสัปดาห์รอบหน้า */
export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <AppLayout>
      <PageHeader
        title="แดชบอร์ด"
        description="ระบบติดตาม Network Event ภาคเหนือ"
        actions={
          atLeast(user?.role, 'editor') && (
            <Link to="/events/new"><Button>บันทึกเหตุการณ์</Button></Link>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-base font-semibold">บัญชีของคุณ</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt style={{ color: 'var(--text-muted)' }}>ชื่อผู้ใช้</dt>
            <dd>{user?.username}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>อีเมล</dt>
            <dd className="break-all">{user?.email}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>บทบาท</dt>
            <dd>{user ? ROLE_LABEL[user.role] : '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>จังหวัดที่ดูแล</dt>
            <dd>
              {user?.provinceScope === null
                ? 'ทุกจังหวัด'
                : user?.provinceScope?.length
                  ? `${user.provinceScope.length} จังหวัด`
                  : '—'}
            </dd>
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">ขั้นถัดไป</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            หน้านี้จะแสดงตัวเลขสรุปรายสัปดาห์เมื่อทำโมดูลรายงานเสร็จ —
            จำนวนเหตุการณ์ต่อจังหวัด สาเหตุที่พบบ่อย และระยะเวลาขัดข้องรวม
          </p>
          <div className="mt-4">
            <Link to="/events"><Button variant="ghost">ดูรายการเหตุการณ์</Button></Link>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
