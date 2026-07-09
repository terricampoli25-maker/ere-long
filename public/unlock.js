// Ere Long unlock page — sends serial + a random per-browser device id
// to the gate worker, which validates it against the license service.

const DEVICE_KEY = 'erelong_device_v1';

let deviceId;
try {
  deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
} catch (_) {
  deviceId = crypto.randomUUID();
}

const form  = document.getElementById('unlock-form');
const input = document.getElementById('unlock-serial');
const btn   = document.getElementById('unlock-btn');
const errEl = document.getElementById('unlock-error');

form.addEventListener('submit', async e => {
  e.preventDefault();
  const serial = input.value.trim().toUpperCase();
  if (!serial) { errEl.textContent = 'Enter the serial from thy purchase email.'; return; }

  btn.disabled = true;
  btn.textContent = 'Unlocking…';
  errEl.textContent = '';

  try {
    const res = await fetch('api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, machineId: deviceId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) { location.replace('./'); return; }
    errEl.textContent = data.error || 'That serial could not be verified.';
  } catch (_) {
    errEl.textContent = 'The gatekeeper could not be reached. Check thy connection.';
  }
  btn.disabled = false;
  btn.textContent = 'Unlock';
});
