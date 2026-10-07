<script setup lang="ts">
/**
 * หน้า embed ที่ไม่มีสิทธิ์ (Permission Manager) — เปิดอยู่ใน WebView ของแอปมือถือ
 * จึงไม่มี AppLayout และไม่พาไปหน้าหลักของเว็บ (ไม่งั้นหน้าเว็บเต็มจะโผล่ในแอป)
 */
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-base-200 p-6">
    <div class="max-w-sm text-center">
      <p class="text-lg font-semibold">ไม่มีสิทธิ์เปิดหน้านี้</p>
      <p class="mt-2 text-sm text-base-content/70">
        บัญชีนี้ถูกปิดสิทธิ์หน้านี้ไว้ ติดต่อผู้ดูแลระบบถ้าต้องใช้งาน
      </p>
    </div>
  </div>
</template>
