# FE-R4

หน้าเว็บของระบบติดตาม Network Event ภาคเหนือ — **Vue 3 + TypeScript + Vite**

```
FE-R4 (Vercel)  ──axios + JWT──►  BE-R4 (Render)  ──►  Supabase
```

Vue 3 `<script setup>` · Pinia · Vue Router 4 · Tailwind v4 + DaisyUI 5

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env        # ตั้ง VITE_API_URL ให้ชี้ไปที่ BE
npm run dev                 # http://localhost:5173
```

ต้องมี **BE-R4 ทำงานอยู่ก่อน** ถึงจะล็อกอินได้ — ไม่มี mock

```bash
cd ../BE-R4 && npm run dev  # http://localhost:8787
```

## โครงสร้าง

```
src/
  main.ts                   createApp + Pinia + router · ตั้งธีมก่อน mount
  App.vue                   <RouterView /> เปล่า ๆ — เลย์เอาต์อยู่ในแต่ละหน้า
  index.css                 Tailwind + ธีม DaisyUI (light/dark) + transition

  router/index.ts           routes + meta + beforeEach (ด่านเดียวของการเข้าหน้า)

  stores/
    auth.ts                 user · bootstrap() · login · logout · can(role)
    theme.ts                เปลือก Pinia ของ lib/theme-store

  lib/                      ไม่ผูกกับ framework — ย้ายข้ามเฟรมเวิร์กได้ทั้งดุ้น
    api.ts                  axios instance + แนบ token + single-flight refresh
    auth-store.ts           อ่าน/เขียน/ล้าง token ใน localStorage
    theme-store.ts          อ่าน/เขียนธีม + apply ลง <html>
    roles.ts                สำเนากติกา role ฝั่งหน้าจอ
    events.ts               type ของ event + จัดรูปวันเวลา/ระยะเวลา

  services/                 1 ไฟล์ = 1 โดเมนของฝั่ง API
    auth.api.ts  events.api.ts  users.api.ts  sites.api.ts  provinces.api.ts

  components/
    AppLayout.vue           header + เมนู ใช้ร่วมทุกหน้าหลังล็อกอิน
    PageHeader.vue          หัวข้อหน้า + slot ปุ่มด้านขวา
    ThemeToggle.vue         สลับธีม สว่าง/มืด/ตามระบบ
    ProvincePicker.vue      เลือกจังหวัดหลายอัน
    SitePicker.vue          ค้นหาสถานีแบบ debounce + เลือกหลายรายการ
    ui/                     BaseButton · BaseField · BaseSelect · BaseTextarea

  views/
    LoginView.vue  RegisterView.vue  ResetPasswordView.vue
    DashboardView.vue  EventsView.vue  EventFormView.vue  UsersView.vue
```

**ทำไมมีทั้ง `lib/` และ `services/`** — `lib/` คือโค้ดที่ไม่รู้จัก Vue เลย ส่วน `services/`
คือ wrapper ของ endpoint ที่แต่ละหน้าเรียกใช้ แยกกันไว้เพราะ `lib/api.ts` ต้องไม่ import
อะไรที่ผูกกับหน้าจอ ไม่งั้นจะ import วนกันเอง

## จุดที่ต้องรู้ก่อนแก้

**single-flight refresh** (`lib/api.ts`) — ส่วนที่พังง่ายที่สุดถ้าแก้ผิด

BE หมุน refresh token ทุกครั้งที่ใช้ ใบเก่าถูกเพิกถอนทันที ถ้ามีหลาย request หมดอายุ
พร้อมกันแล้วต่างคนต่างยิง `/auth/refresh` จะมีแค่ใบแรกที่ผ่าน ที่เหลือ BE จะมองว่าเป็น
การใช้ token ซ้ำ แล้วเพิกถอนทั้งหมด — ผู้ใช้หลุดออกจากระบบทั้งที่ไม่ได้ทำอะไรผิด

```ts
refreshPromise ??= refreshAccessToken().finally(() => { refreshPromise = null })
```

**`router.beforeEach` ต้อง `await auth.bootstrap()` ก่อนตัดสินใจ** (`router/index.ts`)

ไม่งั้นตอนรีเฟรชหน้าที่ต้องล็อกอิน store ยังไม่รู้ว่ามี session ค้างอยู่ แล้วเด้งไป `/login`
ทุกครั้ง `bootstrap()` เรียกซ้ำได้ จะทำงานจริงครั้งเดียวเพราะเก็บ promise ไว้ใน `ready`

**ธีมใช้ `data-theme` ตัวเดียวกับ DaisyUI**

ผู้ใช้เลือกได้ 3 แบบ (สว่าง/มืด/ตามระบบ) แต่ CSS รู้จักแค่ 2 — JS แปลง `system`
เป็นค่าจริงแล้วปั๊ม `data-theme="light|dark"` ลง `<html>` ซึ่งเป็นกลไกที่ DaisyUI
ใช้อยู่แล้วพอดี จึงไม่มีระบบธีมซ้อนกันสองชั้น

- **คีย์ `r4.theme` กับ `data-theme` ซ้ำอยู่ใน `index.html`** เพราะ inline script ต้องรัน
  ก่อน Vue เพื่อกันหน้าขาววาบ แก้ที่ `theme-store.ts` แล้วต้องไล่แก้ที่ `index.html` ด้วย
- **ตั้งใจไม่ใช้ `--prefersdark` ของ DaisyUI** เพราะจะทำให้ OS ชนะการเลือกของผู้ใช้
  การแปลง system → ค่าจริงเป็นหน้าที่ของ `theme-store` ที่เดียว
- **transition เปิดเฉพาะตอนสลับธีม** — ติด `data-theme-transition` ไว้ ~200ms แล้วถอดออก
  ถ้าปล่อยไว้ตลอดจะเห็นสีไล่แวบ ๆ ทุกครั้งที่เปลี่ยนหน้า

**เพิ่มสีใหม่** ให้ประกาศทั้งใน `@plugin "daisyui/theme"` ของ light และ dark เสมอ
อย่าใช้สี Tailwind ดิบ ๆ (`bg-blue-500`) เพราะจะไม่เปลี่ยนตามธีม

## หน้า Network Event

**ทุกคนที่ล็อกอินเข้าดูได้** แม้แต่ viewer และเห็นทุกจังหวัด — ผู้บริหารต้องเห็นภาพรวมทั้งภาค
ปุ่มบันทึก/แก้ไข/ลบซ่อนเองถ้า role ต่ำกว่า editor และ BE ปฏิเสธซ้ำอีกชั้น

`/events/new` ต้องประกาศ **ก่อน** `/events/:id` ใน `router/index.ts` ไม่งั้น `new`
จะถูกจับเป็น id

**SitePicker ต้อง debounce และทิ้งผลที่ล้าสมัย** — ใช้ตัวนับ `seq` เทียบก่อนเขียนผลลง state
ถ้าไม่ทิ้ง ผลของ `CM` ที่กลับมาช้ากว่าผลของ `CMI` จะเขียนทับรายการที่ถูกต้อง
ผู้ใช้จะเห็นเป็น "พิมพ์เร็วแล้วผลไม่ตรง"

**เปลี่ยนจังหวัดแล้วต้องล้างสถานีที่เลือกไว้** BE ปฏิเสธสถานีข้ามจังหวัดอยู่แล้ว
แต่บอกผู้ใช้ตั้งแต่ตอนกดดีกว่าให้ไปเจอตอน submit

**`datetime-local` ไม่รับ timezone** ต้องแปลงด้วย `toLocalInput` / `fromLocalInput`
ใน `lib/events.ts` ถ้าส่ง ISO ที่มี Z เข้าไปตรง ๆ ช่องจะว่างเปล่า

**ปุ่มลบ ลบถาวรจริง** มีไว้แก้กรณีลงข้อมูลผิด ต่างจากสถานะ "ยกเลิก" ที่ใช้กับงาน
ที่ไม่ได้เกิดขึ้นจริงแต่ยังต้องเก็บไว้ — modal ยืนยันอธิบายความต่างนี้ให้ผู้ใช้แล้ว
ลบแล้วสถานีที่ผูกไว้กับไทม์ไลน์หายตาม cascade แต่ `audit_log` ยังเก็บ `old_data` ไว้

## สิทธิ์และการมองเห็น

`lib/roles.ts` เป็น **สำเนา** ของกติกาใน `BE-R4/src/auth/roles.ts` มีไว้ซ่อนปุ่มที่กดไม่ได้
เท่านั้น ไม่ใช่ด่านความปลอดภัย — BE ตรวจซ้ำทุก endpoint เสมอ แก้กติกาต้องแก้ทั้งสองฝั่ง

```
viewer(0) < editor(1) < admin(2) < dev(3)
```

รายการผู้ใช้ในหน้า `/users` มาจาก BE ซึ่งกรอง role ที่สูงกว่าตัวเองออกให้แล้ว
FE ไม่ต้องกรองซ้ำ และ **ห้ามกรองซ้ำ** เพราะจะกลายเป็นกติกาสองชุดที่เพี้ยนจากกันได้
ปุ่มแต่ละแถวใช้ `manageable` ที่ BE คำนวณมาให้ ด้วยเหตุผลเดียวกัน

## ขึ้น Vercel

```
Framework Preset   Vite
Root Directory     FE-R4
Build Command      npm run build
Output Directory   dist
Environment        VITE_API_URL = https://<ชื่อ>.onrender.com
```

`vercel.json` ตั้ง rewrite ทุก path กลับไป `index.html` ไว้แล้ว
ถ้าไม่มีบรรทัดนี้ การเข้า `/events` ตรง ๆ หรือกดรีเฟรชจะได้ 404 เพราะเป็น SPA

**Vite ฝัง `VITE_API_URL` ตอน build ไม่ใช่ตอนรัน** — แก้ค่าบน Vercel แล้วต้อง redeploy
ทุกครั้ง ถ้าปล่อยว่าง `lib/api.ts` จะขึ้นข้อความเตือนแทนที่จะยิงไปหาตัวเองแล้วได้ 405

หลัง deploy ต้องเพิ่ม URL ของ Vercel ลงใน `CORS_ORIGIN` และ `APP_URL` ของ BE ด้วย

## ทดสอบด้วยมือ

1. เข้า `/dashboard` ทั้งที่ยังไม่ล็อกอิน → ต้องเด้งไป `/login`
2. ล็อกอินผิด → ขึ้นข้อความไทย ไม่ใช่ error ดิบ
3. ล็อกอินถูก → เข้า `/dashboard` เห็นชื่อผู้ใช้
4. รีเฟรชหน้า → ยังล็อกอินอยู่ ไม่กระพริบไปหน้า login
5. ลบ `r4.accessToken` ใน localStorage (เหลือ `r4.refreshToken`) แล้วรีเฟรช → ต่อ session ได้เอง
6. ลบทั้งสองคีย์ แล้วรีเฟรช → เด้งไป `/login`
7. ออกจากระบบ → กลับไป `/login` และเข้า `/dashboard` ซ้ำไม่ได้
8. กดธีม "มืด" → รีเฟรช → ต้องมืดตั้งแต่เฟรมแรก ไม่เห็นพื้นขาววาบ
9. เลือก "ตามระบบ" แล้วสลับ dark mode ที่ OS → เปลี่ยนตามทันทีโดยไม่ต้องรีเฟรช
10. สมัครบัญชีใหม่ → ล็อกอินทันที ต้องขึ้นว่า "รอผู้ดูแลอนุมัติ" ไม่ใช่ "รหัสผ่านไม่ถูกต้อง"
11. ล็อกอินเป็น dev → เข้า `/users` → อนุมัติบัญชีนั้น → ล็อกอินด้วยบัญชีใหม่ได้
12. บัญชี viewer พิมพ์ `/users` ตรง ๆ → ต้องเด้งกลับ `/dashboard`
13. กด "ลิงก์รีเซ็ตรหัส" → เปิดลิงก์ → ตั้งรหัสใหม่ → เปิดลิงก์เดิมซ้ำต้องใช้ไม่ได้
14. บันทึกเหตุการณ์ใหม่ → ได้เลข `EV-2026-xxxx` อัตโนมัติ
15. เลือกสถานี → เปลี่ยนจังหวัด → รายการสถานีถูกล้างพร้อมข้อความแจ้ง
16. ตั้งสถานะ "แก้ไขแล้ว" โดยไม่ใส่เวลากู้คืน → ต้องถูกปฏิเสธพร้อมเหตุผล
17. ล็อกอินเป็น editor ที่ดูแลจังหวัดเดียว → บันทึก/ลบจังหวัดอื่นต้องขึ้น 403
18. viewer เปิด `/events/:id` → เห็นข้อมูลครบแต่ไม่มีปุ่มบันทึกและปุ่มลบ
