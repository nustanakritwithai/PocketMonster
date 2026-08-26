window.addEventListener('error', event => {
  const status = document.getElementById('startupStatus');
  if (status) { status.textContent = `เกิดข้อผิดพลาด: ${event.message || 'ไม่ทราบสาเหตุ'}`; status.className = 'startup-status error'; }
});

window.addEventListener('unhandledrejection', event => {
  const status = document.getElementById('startupStatus');
  if (status) { status.textContent = `เริ่มเกมไม่สำเร็จ: ${event.reason?.message || event.reason || 'ไม่ทราบสาเหตุ'}`; status.className = 'startup-status error'; }
});
