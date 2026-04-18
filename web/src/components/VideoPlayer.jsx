/**
 * HUB 2.0 — Premium Secure Video Player
 *
 * PRIMARY USE CASE: Local MP4 file playback with full security
 * SECONDARY USE CASE: AES-128 encrypted HLS streaming
 *
 * ─── Playback ───────────────────────────────────────────────────────────────
 *  • Local file via protected Blob URL (obfuscated, auto-revoked on unmount)
 *  • HLS adaptive streaming with AES-128 decryption (Video.js VHS)
 *  • Multi-quality switching (Auto / 1080p / 720p / 480p / 360p)
 *  • Playback speed 0.25x → 2x
 *  • Chapter markers on timeline
 *  • VTT subtitle / CC support
 *
 * ─── Controls (YouTube-parity) ──────────────────────────────────────────────
 *  • Play / Pause / Rewind / Forward
 *  • Click-to-seek, drag scrubber, hover timestamp tooltip
 *  • Buffer bar + chapter dots on progress bar
 *  • Volume slider (expand-on-hover) + scroll-wheel control
 *  • Mute toggle with OSD pop
 *  • Picture-in-Picture (native browser API)
 *  • Theater mode (expand + darken backdrop)
 *  • Fullscreen (Fullscreen API)
 *  • Auto-hide controls after 3.5s; restore on mouse move
 *  • Double-click → ±10s seek with flash animation
 *
 * ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
 *  Space / K  →  Play / Pause
 *  J          →  -10s
 *  L          →  +10s
 *  ← / →     →  -5s / +5s
 *  ↑ / ↓     →  Volume +/- 10%
 *  F          →  Toggle fullscreen
 *  T          →  Toggle theater mode
 *  M          →  Toggle mute
 *  ,  /  .    →  Speed down / up (0.25 step)
 *  P          →  Picture-in-Picture
 *  0-9        →  Jump to 0%–90%
 *  Ctrl+S     →  BLOCKED (security)
 *
 * ─── Security ───────────────────────────────────────────────────────────────
 *  • Right-click on video → blocked
 *  • Drag-to-save → blocked
 *  • Ctrl+S download shortcut → blocked
 *  • Blob URL obfuscation (ArrayBuffer copy, original File reference dropped)
 *  • Invisible canvas-rendered watermark (session fingerprint + timestamp)
 *  • Visible low-opacity watermark overlay (username / ID)
 *  • Dev-tools detector → pauses video + warns (optional)
 *  • CSS: pointer-events shield over `<video>` element
 *  • HTMLVideoElement: disablePictureInPicture when security mode is strict
 */
import {
  useEffect, useRef, useState, useCallback, useMemo,
} from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import {
  getSessionFingerprint,
  buildWatermarkText,
  createProtectedBlobUrl,
  installVideoProtection,
} from '../lib/playerSecurity'
import './VideoPlayer.css'

// ─────────────────────────────────────────────────────────────────────────────
const fmt = (s) => {
  const t  = Math.max(0, Math.floor(s || 0))
  const h  = Math.floor(t / 3600)
  const m  = Math.floor((t % 3600) / 60)
  const ss = t % 60
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
  return `${m}:${String(ss).padStart(2,'0')}`
}

const SPEEDS   = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const QUALITIES = ['Auto', '1080p', '720p', '480p', '360p']

function MenuPanel({ title, items, active, onSelect, onClose }) {
  return (
    <div className="hub-player__menu" onMouseLeave={onClose}>
      <div className="hub-player__menu-header">{title}</div>
      {items.map((item) => (
        <div
          key={String(item.value)}
          className={`hub-player__menu-item${item.value === active ? ' hub-player__menu-item--active' : ''}`}
          onClick={() => { onSelect(item.value); onClose() }}
        >
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function VideoPlayer({
  // Remote HLS stream (optional — local file takes priority)
  src        = null,
  poster     = null,
  title      = '',
  videoId    = null,
  // Local player features
  username   = null,       // for watermark; falls back to fingerprint
  strictMode = false,      // disables PiP + stronger watermark
  // Extra features
  chapters   = [],         // [{ time: Number, label: String }]
  subtitles  = [],         // [{ src, label, lang }]
  onEnded    = undefined,
  nextVideo  = null,       // { title, onPlay }
  theaterMode     = false,
  onTheaterToggle = undefined,
}) {
  // ── Refs ──────────────────────────────────────────────────
  const containerRef  = useRef(null)
  const videoRef      = useRef(null)
  const playerRef     = useRef(null)
  const progressRef   = useRef(null)
  const fileInputRef  = useRef(null)
  const hideTimer     = useRef(null)
  const osdTimer      = useRef(null)
  const nextTimer     = useRef(null)

  // ── Local file state ──────────────────────────────────────
  const [localBlobUrl,  setLocalBlobUrl]  = useState(null)
  const [localFileName, setLocalFileName] = useState(null)
  const [loadingFile,   setLoadingFile]   = useState(false)

  // ── Player state ──────────────────────────────────────────
  const [playing,      setPlaying]      = useState(false)
  const [buffering,    setBuffering]    = useState(false)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [buffered,     setBuffered]     = useState(0)
  const [volume,       setVolume]       = useState(1)
  const [muted,        setMuted]        = useState(false)
  const [fullscreen,   setFullscreen]   = useState(false)
  const [pip,          setPip]          = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [speed,        setSpeed]        = useState(1)
  const [quality,      setQuality]      = useState('Auto')
  const [caption,      setCaption]      = useState(null)
  const [error,        setError]        = useState(null)
  const [hoverTime,    setHoverTime]    = useState(null)
  const [hoverX,       setHoverX]       = useState(0)
  const [osd,          setOsd]          = useState(null)
  const [toast,        setToast]        = useState(null)
  const [tapFlash,     setTapFlash]     = useState(null)
  const [menu,         setMenu]         = useState(null)
  const [ended,        setEnded]        = useState(false)
  const [nextCountdown,setNextCountdown]= useState(null)
  const [dragging,     setDragging]     = useState(false)
  const [watermarkPos, setWatermarkPos] = useState({ top: '12%', left: '8%' })
  const [devToolsOpen, setDevToolsOpen] = useState(false)

  // Active source: local blob takes priority
  const activeSrc = localBlobUrl || src

  // ── Security — session fingerprint ───────────────────────
  const fingerprint = useMemo(() => getSessionFingerprint(), [])
  const watermarkText = useMemo(
    () => buildWatermarkText(username, fingerprint),
    [username, fingerprint]
  )

  // ── Security — move watermark randomly every 30s ─────────
  useEffect(() => {
    const move = () => {
      setWatermarkPos({
        top:  `${10 + Math.random() * 80}%`,
        left: `${5  + Math.random() * 75}%`,
      })
    }
    const id = setInterval(move, 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Security — dev tools warning ─────────────────────────
  useEffect(() => {
    if (!strictMode) return
    const threshold = 160
    const check = () => {
      const open =
        window.outerWidth  - window.innerWidth  > threshold ||
        window.outerHeight - window.innerHeight > threshold
      setDevToolsOpen(open)
      if (open && playerRef.current) playerRef.current.pause()
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [strictMode])

  // ── Init / tear down Video.js ─────────────────────────────
  useEffect(() => {
    if (!videoRef.current || !activeSrc) return

    // Dynamically inject the video element so videojs can safely destroy it on dismount
    // without clashing with React's Virtual DOM.
    const videoEl = document.createElement('video')
    videoEl.className = 'video-js'
    videoEl.playsInline = true
    videoEl.crossOrigin = 'use-credentials'
    videoEl.style.pointerEvents = 'none'
    if (poster) videoEl.poster = poster
    videoRef.current.appendChild(videoEl)

    const player = videojs(videoEl, {
      controls:   false,
      autoplay:   false,
      preload:    'auto',
      fluid:      false,
      html5: {
        vhs: {
          overrideNative:           true,
          enableLowInitialPlaylist: true,
        },
      },
    })

    playerRef.current = player

    const isHLS = activeSrc.includes('.m3u8')
    player.src(
      isHLS
        ? { src: activeSrc, type: 'application/x-mpegURL', withCredentials: true }
        : { src: activeSrc, type: 'video/mp4' }
    )

    player.on('loadedmetadata', () => {
      setDuration(player.duration())
      setError(null)
    })
    player.on('timeupdate', () => {
      setCurrentTime(player.currentTime())
      const buf = player.buffered()
      if (buf.length) setBuffered(buf.end(buf.length - 1))
    })
    player.on('play',    () => { setPlaying(true);  setEnded(false) })
    player.on('pause',   () => setPlaying(false))
    player.on('waiting', () => setBuffering(true))
    player.on('playing', () => setBuffering(false))
    player.on('canplay', () => setBuffering(false))
    player.on('ended',   () => {
      setPlaying(false); setEnded(true)
      onEnded?.()
      if (nextVideo) {
        let c = 5; setNextCountdown(c)
        nextTimer.current = setInterval(() => {
          c--; if (c <= 0) { clearInterval(nextTimer.current); nextVideo.onPlay?.() }
          else setNextCountdown(c)
        }, 1000)
      }
    })
    player.on('error', () => {
      const e = player.error()
      setError(e?.message || 'Playback failed. The file may be corrupt or unsupported.')
      setBuffering(false)
    })
    player.on('volumechange', () => { setVolume(player.volume()); setMuted(player.muted()) })

    // ── Security: install on the raw video element ──────────
    const rawMediaEl = videoEl.querySelector('video') || videoEl
    const cleanup = installVideoProtection(rawMediaEl)

    return () => {
      cleanup()
      clearInterval(nextTimer.current)
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrc])

  // ── PiP events ────────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current?.querySelector('video') || videoRef.current
    if (!el) return
    const onIn  = () => setPip(true)
    const onOut = () => setPip(false)
    el.addEventListener('enterpictureinpicture', onIn)
    el.addEventListener('leavepictureinpicture', onOut)
    return () => {
      el.removeEventListener('enterpictureinpicture', onIn)
      el.removeEventListener('leavepictureinpicture', onOut)
    }
  }, [activeSrc])

  // ── Fullscreen listener ───────────────────────────────────
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // ── Local file revoke on unmount ──────────────────────────
  useEffect(() => {
    return () => { if (localBlobUrl) URL.revokeObjectURL(localBlobUrl) }
  }, [localBlobUrl])

  // ── Controls auto-hide ────────────────────────────────────
  const showUI = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (playing && !menu && !dragging) setShowControls(false)
    }, 3500)
  }, [playing, menu, dragging])

  useEffect(() => { showUI() }, [playing, showUI])

  // ── OSD / Toast helpers ───────────────────────────────────
  const showOsd = useCallback((icon, label) => {
    setOsd({ icon, label })
    clearTimeout(osdTimer.current)
    osdTimer.current = setTimeout(() => setOsd(null), 1500)
  }, [])

  const [toastKey, setToastKey] = useState(0)
  const showToast = useCallback((msg) => {
    setToast(msg); setToastKey(k => k + 1)
    setTimeout(() => setToast(null), 1200)
  }, [])

  // ── Play / Pause ──────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const p = playerRef.current; if (!p) return
    if (p.paused()) { p.play(); showOsd('▶', 'Play') }
    else            { p.pause(); showOsd('⏸', 'Pause') }
    showUI()
  }, [showOsd, showUI])

  // ── Seek ──────────────────────────────────────────────────
  const seek = useCallback((delta) => {
    const p = playerRef.current; if (!p) return
    p.currentTime(Math.max(0, Math.min(p.duration(), p.currentTime() + delta)))
    showUI()
  }, [showUI])

  const seekTo = useCallback((t) => {
    const p = playerRef.current; if (!p) return
    p.currentTime(Math.max(0, Math.min(p.duration(), t)))
  }, [])

  // ── Volume ────────────────────────────────────────────────
  const changeVolume = useCallback((v) => {
    const p = playerRef.current; if (!p) return
    const c = Math.max(0, Math.min(1, v))
    p.volume(c); p.muted(c === 0)
    showOsd(c === 0 ? '🔇' : c < 0.5 ? '🔉' : '🔊', `${Math.round(c * 100)}%`)
  }, [showOsd])

  const toggleMute = useCallback(() => {
    const p = playerRef.current; if (!p) return
    const n = !p.muted(); p.muted(n)
    showOsd(n ? '🔇' : '🔊', n ? 'Muted' : 'Unmuted')
  }, [showOsd])

  // ── Playback speed ────────────────────────────────────────
  const setRate = useCallback((r) => {
    const p = playerRef.current; if (!p) return
    p.playbackRate(r); setSpeed(r); showToast(`${r}x`)
  }, [showToast])

  // ── Fullscreen ────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current; if (!el) return
    if (!document.fullscreenElement) await el.requestFullscreen()
    else                             await document.exitFullscreen()
  }, [])

  // ── PiP ───────────────────────────────────────────────────
  const togglePip = useCallback(async () => {
    if (strictMode) return
    const vid = videoRef.current?.querySelector('video') || videoRef.current
    if (!vid) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else                                  await vid.requestPictureInPicture()
    } catch { /* browser doesn't support */ }
  }, [strictMode])

  // ── Quality ───────────────────────────────────────────────
  const changeQuality = useCallback((q) => {
    setQuality(q); showToast(`Quality: ${q}`)
    const p = playerRef.current; if (!p) return
    const vhs = p.tech(true)?.vhs
    if (!vhs) return
    const heights = { '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 }
    if (q === 'Auto') vhs.representations().forEach((r) => r.enabled(true))
    else vhs.representations().forEach((r) => r.enabled(r.height === heights[q]))
  }, [showToast])

  // ── Caption ───────────────────────────────────────────────
  const changeCaption = useCallback((lang) => {
    setCaption(lang)
    const p = playerRef.current; if (!p) return
    Array.from(p.textTracks()).forEach((t) => {
      t.mode = t.language === lang ? 'showing' : 'hidden'
    })
    showToast(lang ? `CC: ${lang}` : 'Subtitles off')
  }, [showToast])

  // ── Local file picker ─────────────────────────────────────
  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files[0]; if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Unsupported file type. Please select a video file.'); return
    }
    setLoadingFile(true)
    setError(null); setEnded(false); setCurrentTime(0)
    // Revoke previous blob
    if (localBlobUrl) URL.revokeObjectURL(localBlobUrl)
    try {
      const url = await createProtectedBlobUrl(file)
      setLocalBlobUrl(url)
      setLocalFileName(file.name)
    } catch {
      setError('Failed to load file.')
    } finally {
      setLoadingFile(false)
      e.target.value = ''  // reset input so re-selecting same file works
    }
  }, [localBlobUrl])

  const clearLocalFile = useCallback(() => {
    if (localBlobUrl) URL.revokeObjectURL(localBlobUrl)
    setLocalBlobUrl(null); setLocalFileName(null)
    setCurrentTime(0); setDuration(0); setEnded(false)
  }, [localBlobUrl])

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return
      if (!activeSrc) return
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break
        case 'j': e.preventDefault(); seek(-10); showToast('⟸ 10s'); break
        case 'l': e.preventDefault(); seek( 10); showToast('10s ⟹'); break
        case 'ArrowLeft':  e.preventDefault(); seek(-5);  showToast('⟸ 5s'); break
        case 'ArrowRight': e.preventDefault(); seek( 5);  showToast('5s ⟹'); break
        case 'ArrowUp':    e.preventDefault(); changeVolume(volume + 0.1); break
        case 'ArrowDown':  e.preventDefault(); changeVolume(volume - 0.1); break
        case 'f':          e.preventDefault(); toggleFullscreen(); break
        case 't':          e.preventDefault(); onTheaterToggle?.(); break
        case 'm':          e.preventDefault(); toggleMute(); break
        case ',':          e.preventDefault(); setRate(Math.max(0.25, speed - 0.25)); break
        case '.':          e.preventDefault(); setRate(Math.min(2,    speed + 0.25)); break
        case 'p': case 'i':e.preventDefault(); togglePip(); break
        case 'c':          e.preventDefault(); setMenu(m => m === 'captions' ? null : 'captions'); break
        default:
          if (/^[0-9]$/.test(e.key)) { e.preventDefault(); seekTo((Number(e.key)/10)*duration); showToast(`${e.key}0%`) }
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [togglePlay, seek, changeVolume, volume, toggleFullscreen, toggleMute,
      togglePip, seekTo, duration, speed, setRate, showToast, activeSrc, onTheaterToggle])

  // ── Scroll-wheel volume ───────────────────────────────────
  const onWheel = useCallback((e) => {
    changeVolume(volume + (e.deltaY < 0 ? 0.1 : -0.1))
  }, [changeVolume, volume])

  // ── Progress bar ──────────────────────────────────────────
  const getRatio = (e) => {
    const bar = progressRef.current; if (!bar) return 0
    const r = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  }

  const onProgressMove = (e) => {
    const ratio = getRatio(e)
    const bar = progressRef.current; if (!bar) return
    setHoverX(e.clientX - bar.getBoundingClientRect().left)
    setHoverTime(ratio * duration)
    if (dragging) seekTo(ratio * duration)
  }

  const onProgressDown = (e) => {
    setDragging(true)
    seekTo(getRatio(e) * duration)
  }

  useEffect(() => {
    const up = () => {
      if (dragging) setDragging(false)
    }
    window.addEventListener('mouseup', up)
    window.addEventListener('touchend', up)
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up) }
  }, [dragging])

  // ── Double-click sides → ±10s ─────────────────────────────
  const lastClick = useRef({ side: null, t: 0 })
  const handleAreaClick = (side) => {
    const now = Date.now()
    if (lastClick.current.side === side && now - lastClick.current.t < 350) {
      const delta = side === 'left' ? -10 : 10
      seek(delta)
      setTapFlash(side)
      setTimeout(() => setTapFlash(null), 600)
      lastClick.current = { side: null, t: 0 }
    } else {
      lastClick.current = { side, t: now }
    }
  }

  // ── Computed values ───────────────────────────────────────
  const fillPct  = duration > 0 ? `${(currentTime / duration) * 100}%` : '0%'
  const buffPct  = duration > 0 ? `${(buffered  / duration) * 100}%` : '0%'
  const thumbPos = duration > 0 ? `${(currentTime / duration) * 100}%` : '0%'
  const volIcon  = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'
  const volPct   = `${Math.round((muted ? 0 : volume) * 100)}%`

  const chapterMarkers = useMemo(() =>
    chapters.map((c) => ({ ...c, pct: duration > 0 ? `${(c.time/duration)*100}%` : '0%' })),
    [chapters, duration]
  )

  // ── Player classes ────────────────────────────────────────
  const cls = [
    'hub-player',
    fullscreen       ? 'hub-player--fullscreen' : '',
    pip && !strictMode ? 'hub-player--pip'      : '',
    theaterMode && !fullscreen ? 'hub-player--theater' : '',
  ].filter(Boolean).join(' ')

  // ── No source — show file picker ──────────────────────────
  if (!activeSrc) {
    return (
      <div className="hub-player hub-player--empty" ref={containerRef}>
        <div className="hub-player__drop-zone" onClick={() => fileInputRef.current?.click()}>
          <div className="hub-player__drop-icon">▶</div>
          <p className="hub-player__drop-title">Open a video file to play</p>
          <p className="hub-player__drop-sub">MP4, MOV, MKV, AVI, WebM — drag &amp; drop or click</p>
          <button className="hub-player__drop-btn">
            📁 Browse files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
        {/* Keyboard tips */}
        <div className="hub-player__shortcuts-hint">
          <span>Space — Play/Pause</span>
          <span>F — Fullscreen</span>
          <span>J/L — ±10s</span>
          <span>↑/↓ — Volume</span>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────
  // FULL PLAYER RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={cls}
      onMouseMove={showUI}
      onMouseLeave={() => { if (playing && !menu) setShowControls(false) }}
      onWheel={onWheel}
      tabIndex={0}
      aria-label="Video player"
    >
      {/* ── Drag & drop overlay ── */}
      <div
        className="hub-player__drag-shield"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) handleFileSelect({ target: { files: [f], value: '' } })
        }}
      />

      <div className="hub-player__video-wrap" ref={videoRef}>
        {/* React injected dynamic <video> via useEffect */}

        {/* ── Loading overlay ── */}
        {loadingFile && (
          <div className="hub-player__spinner">
            <div className="hub-player__spinner-ring" />
            <p style={{ color: '#fff', marginTop: 12, fontSize: 13 }}>Loading file…</p>
          </div>
        )}

        {/* ── Buffering spinner ── */}
        {buffering && !loadingFile && !error && (
          <div className="hub-player__spinner">
            <div className="hub-player__spinner-ring" />
          </div>
        )}

        {/* ── Dev tools warning ── */}
        {devToolsOpen && (
          <div className="hub-player__error" style={{ zIndex: 50 }}>
            <span style={{ fontSize: 40 }}>🛡</span>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Playback Paused</p>
            <p className="hub-player__error-msg">Close developer tools to resume playback.</p>
          </div>
        )}

        {/* ── Error overlay ── */}
        {error && !devToolsOpen && (
          <div className="hub-player__error">
            <span className="hub-player__error-icon">⚠️</span>
            <p style={{ color: '#fff', fontWeight: 700 }}>Playback Error</p>
            <p className="hub-player__error-msg">{error}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="hub-player__error-retry"
                onClick={() => { setError(null); playerRef.current?.load() }}>
                Retry
              </button>
              <button className="hub-player__error-retry" style={{ background: 'rgba(255,255,255,0.1)' }}
                onClick={() => fileInputRef.current?.click()}>
                Open other file
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFileSelect} />
          </div>
        )}

        {/* ── OSD (volume/speed flash) ── */}
        {osd && (
          <div key={`${osd.icon}${osd.label}`} className="hub-player__osd">
            <span className="hub-player__osd-icon">{osd.icon}</span>
            <span className="hub-player__osd-label">{osd.label}</span>
          </div>
        )}

        {/* ── Keyboard toast ── */}
        {toast && <div key={toastKey} className="hub-player__toast">{toast}</div>}

        {/* ── Double-tap flash ── */}
        {tapFlash && (
          <div key={tapFlash + Date.now()} className={`hub-player__tap-flash hub-player__tap-flash--${tapFlash}`}>
            {tapFlash === 'left' ? '⟸10s' : '10s⟹'}
          </div>
        )}

        {/* ── Menus ── */}
        {menu === 'quality' && (
          <MenuPanel title="Quality" items={QUALITIES.map(q=>({label:q,value:q}))}
            active={quality} onSelect={changeQuality} onClose={()=>setMenu(null)} />
        )}
        {menu === 'speed' && (
          <MenuPanel title="Playback Speed"
            items={SPEEDS.map(s=>({ label:`${s}x${s===1?' (Normal)':''}`, value:s }))}
            active={speed} onSelect={setRate} onClose={()=>setMenu(null)} />
        )}
        {menu === 'captions' && (
          <MenuPanel title="Subtitles / CC"
            items={[{label:'Off',value:null},...subtitles.map(s=>({label:s.label,value:s.lang}))]}
            active={caption} onSelect={changeCaption} onClose={()=>setMenu(null)} />
        )}

        {/* ── Next video card ── */}
        {ended && nextVideo && nextCountdown !== null && (
          <div className="hub-player__next-card">
            <span className="hub-player__next-label">Up Next in {nextCountdown}s</span>
            <span className="hub-player__next-title">{nextVideo.title}</span>
            <button className="hub-player__next-btn" onClick={() => {
              clearInterval(nextTimer.current); setNextCountdown(null); nextVideo.onPlay?.()
            }}>▶ Play Now</button>
          </div>
        )}

        {/* ── SECURITY: Watermark overlay ── */}
        <div
          className="hub-player__watermark"
          style={{ top: watermarkPos.top, left: watermarkPos.left }}
          aria-hidden="true"
        >
          {watermarkText}
        </div>

        {/* ── Click zones (for double-tap) ── */}
        <div className="hub-player__tap-zones" onClick={togglePlay}>
          <div className="hub-player__tap-left"  onClick={(e) => { e.stopPropagation(); handleAreaClick('left')  }} />
          <div className="hub-player__tap-right" onClick={(e) => { e.stopPropagation(); handleAreaClick('right') }} />
        </div>

        {/* ── Controls overlay ── */}
        <div
          className={`hub-player__overlay${showControls ? '' : ' hub-player__overlay--hidden'}`}
          onClick={(e) => { if (e.target === e.currentTarget) togglePlay() }}
        >
          {/* Top bar */}
          <div className="hub-player__top">
            <span className="hub-player__title">
              {localFileName || title || 'HUB 2.0'}
            </span>
            <span className="hub-player__quality-badge">{quality}</span>
            {/* Open new file button always visible */}
            <label className="hub-player__ctrl" title="Open file" style={{ cursor: 'pointer', marginLeft: 4 }}>
              📁
              <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFileSelect} />
            </label>
            {localBlobUrl && (
              <button className="hub-player__ctrl" title="Close file" onClick={clearLocalFile}>✕</button>
            )}
          </div>

          {/* Centre controls */}
          <div className="hub-player__center">
            <button className="hub-player__skip-btn" onClick={(e)=>{e.stopPropagation();seek(-10)}} title="Rewind 10s (J)">
              <span className="hub-player__skip-icon">↺</span>
              <span className="hub-player__skip-label">10</span>
            </button>
            <button className="hub-player__play-btn" onClick={(e)=>{e.stopPropagation();togglePlay()}} title="Play/Pause (Space)">
              {playing ? '⏸' : '▶'}
            </button>
            <button className="hub-player__skip-btn" onClick={(e)=>{e.stopPropagation();seek(10)}} title="Forward 10s (L)">
              <span className="hub-player__skip-icon">↻</span>
              <span className="hub-player__skip-label">10</span>
            </button>
          </div>

          {/* Bottom */}
          <div className="hub-player__bottom" onClick={(e) => e.stopPropagation()}>
            {/* Progress bar */}
            <div
              ref={progressRef}
              className="hub-player__progress"
              onMouseDown={onProgressDown}
              onMouseMove={onProgressMove}
              onMouseLeave={() => setHoverTime(null)}
            >
              <div className="hub-player__progress-buffer" style={{ width: buffPct }} />
              <div className="hub-player__progress-fill"   style={{ width: fillPct }} />
              <div className="hub-player__progress-thumb"  style={{ left: thumbPos }} />
              {chapterMarkers.map(c => (
                <div key={c.time} className="hub-player__chapter-marker" style={{ left: c.pct }} title={c.label} />
              ))}
              {hoverTime !== null && (
                <div className="hub-player__progress-tooltip" style={{ left: hoverX }}>
                  {fmt(hoverTime)}
                </div>
              )}
            </div>

            {/* Control row */}
            <div className="hub-player__controls-row">
              <button className="hub-player__ctrl" title="Play/Pause (Space)" onClick={togglePlay}>
                {playing ? '⏸' : '▶'}
              </button>
              <button className="hub-player__ctrl" title="Rewind 10s (J)" onClick={() => seek(-10)}>↺</button>
              <button className="hub-player__ctrl" title="Forward 10s (L)" onClick={() => seek(10)}>↻</button>

              {/* Volume */}
              <div className="hub-player__volume-wrap" style={{ '--vol': volPct }}>
                <button className="hub-player__ctrl" title="Mute (M)" onClick={toggleMute}
                  style={{ flexShrink:0, width:36, height:36 }}>{volIcon}</button>
                <input
                  className="hub-player__volume-slider"
                  type="range" min={0} max={1} step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                />
              </div>

              {/* Time */}
              <span className="hub-player__time">
                {fmt(currentTime)}<span className="hub-player__time-sep">/</span>{fmt(duration)}
              </span>

              <div className="hub-player__spacer" />

              {/* CC */}
              {subtitles.length > 0 && (
                <button
                  className={`hub-player__ctrl${menu==='captions'?' hub-player__ctrl--active':''}`}
                  title="Subtitles/CC (C)" onClick={() => setMenu(m => m==='captions'?null:'captions')}>
                  CC
                </button>
              )}

              {/* Speed */}
              <button
                className={`hub-player__ctrl${menu==='speed'?' hub-player__ctrl--active':''}`}
                title="Playback speed (,/.)"
                style={{ fontSize:'0.72rem', fontWeight:700, width:'auto', padding:'0 8px' }}
                onClick={() => setMenu(m => m==='speed'?null:'speed')}
              >{speed}x</button>

              {/* Quality */}
              <button
                className={`hub-player__ctrl${menu==='quality'?' hub-player__ctrl--active':''}`}
                title="Quality"
                style={{ fontSize:'0.68rem', fontWeight:700, width:'auto', padding:'0 6px' }}
                onClick={() => setMenu(m => m==='quality'?null:'quality')}
              >{quality}</button>

              {/* Theater */}
              {onTheaterToggle && (
                <button
                  className={`hub-player__ctrl${theaterMode?' hub-player__ctrl--active':''}`}
                  title="Theater mode (T)" onClick={onTheaterToggle}>⬛</button>
              )}

              {/* PiP */}
              {!strictMode && 'pictureInPictureEnabled' in document && (
                <button
                  className={`hub-player__ctrl${pip?' hub-player__ctrl--active':''}`}
                  title="Picture-in-Picture (P)" onClick={togglePip}>⧉</button>
              )}

              {/* Fullscreen */}
              <button className="hub-player__ctrl" title="Fullscreen (F)" onClick={toggleFullscreen}>
                {fullscreen ? '✕' : '⛶'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
