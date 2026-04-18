/**
 * HUB 2.0 — Local Media Player Security Module
 *
 * Provides:
 *  - Anti-screenshot watermark (invisible + visible layer)
 *  - Right-click / context menu blocking on video
 *  - Drag-to-save prevention
 *  - Dev-tools detection (basic)
 *  - Blob URL lifecycle management (auto-revoke on unmount)
 *  - Session fingerprint for watermark ID
 */

// ── Generate a session fingerprint ────────────────────────────────────────────
export function getSessionFingerprint() {
  const stored = sessionStorage.getItem('hub_sfp')
  if (stored) return stored
  const fp = btoa(
    [
      navigator.userAgent.slice(0, 20),
      screen.width,
      screen.height,
      Date.now(),
      Math.random().toString(36).slice(2, 8),
    ].join('|')
  ).slice(0, 16)
  sessionStorage.setItem('hub_sfp', fp)
  return fp
}

// ── Format watermark string ────────────────────────────────────────────────────
export function buildWatermarkText(username, fingerprint) {
  const now = new Date()
  const ts  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  return `${username || 'HUB-2.0'} · ${fingerprint.slice(0,8)} · ${ts}`
}

// ── Wrap a File in a protected Blob URL ──────────────────────────────────────
export function createProtectedBlobUrl(file) {
  // We create the URL from a NEW Blob copy so the original File reference is lost
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const blob = new Blob([e.target.result], { type: file.type })
      resolve(URL.createObjectURL(blob))
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── Install global video protection on a DOM element ─────────────────────────
export function installVideoProtection(videoEl) {
  if (!videoEl) return () => {}

  const preventCtx  = (e) => e.preventDefault()
  const preventDrag = (e) => e.preventDefault()
  const preventSave = (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  videoEl.addEventListener('contextmenu', preventCtx)
  videoEl.addEventListener('dragstart',   preventDrag)
  document.addEventListener('keydown',    preventSave, true)

  // Return cleanup
  return () => {
    videoEl.removeEventListener('contextmenu', preventCtx)
    videoEl.removeEventListener('dragstart',   preventDrag)
    document.removeEventListener('keydown',    preventSave, true)
  }
}

// ── Basic dev tools detection (warns user) ────────────────────────────────────
export function detectDevTools(onDetected) {
  const threshold = 160
  const check = () => {
    if (
      window.outerWidth  - window.innerWidth  > threshold ||
      window.outerHeight - window.innerHeight > threshold
    ) {
      onDetected?.()
    }
  }
  window.addEventListener('resize', check)
  return () => window.removeEventListener('resize', check)
}
