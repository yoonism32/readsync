const LOG_TAG = 'ReadSync';

function generateStableFingerprint(): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
  }
  const canvasFingerprint = canvas.toDataURL().slice(-50);

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    !!window.indexedDB,
    typeof Worker,
    navigator.platform,
    navigator.cookieEnabled,
    canvasFingerprint,
  ].join('|');

  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 6);
}

export function generateDeviceId(): string {
  let deviceId = localStorage.getItem('readsync_device_id');

  if (!deviceId) {
    const fingerprint = generateStableFingerprint();
    const browserInfo = navigator.userAgent.includes('Chrome') ? 'chrome'
      : navigator.userAgent.includes('Firefox') ? 'firefox'
      : navigator.userAgent.includes('Safari') ? 'safari'
      : 'browser';

    deviceId = `${browserInfo}-${fingerprint}`;

    const existingDevices = JSON.parse(localStorage.getItem('readsync_known_devices') ?? '[]') as Array<{ id: string }>;
    const conflictingDevice = existingDevices.find(d => d.id === deviceId);

    if (conflictingDevice) {
      const randomSuffix = Math.random().toString(36).slice(2, 4);
      deviceId = `${deviceId}-${randomSuffix}`;
    }

    localStorage.setItem('readsync_device_id', deviceId);

    const deviceInfo = { id: deviceId, created: Date.now(), userAgent: navigator.userAgent };
    existingDevices.push(deviceInfo);
    localStorage.setItem('readsync_known_devices', JSON.stringify(existingDevices.slice(-5)));

    try { console.debug(`[${LOG_TAG}]`, 'Generated new stable device id', { deviceId, fingerprint, browserInfo }); } catch { /* */ }
  } else {
    try { console.debug(`[${LOG_TAG}]`, 'Using existing device id', deviceId); } catch { /* */ }
  }

  return deviceId;
}

export function getDeviceLabel(): string {
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const browser = navigator.userAgent.includes('Chrome') ? 'Chrome'
    : navigator.userAgent.includes('Firefox') ? 'Firefox'
    : navigator.userAgent.includes('Safari') ? 'Safari'
    : 'Browser';
  return isMobile ? `Mobile-${browser}` : `Desktop-${browser}`;
}
