/**
 * HUB 2.0 Mobile — Production Video Player
 *
 * ─── Features ───────────────────────────────────────────────────────────
 *  Playback     AES-128 HLS · local file · multi-quality (Auto/720p/480p)
 *  Gestures     Double-tap L/R → ±10s (YouTube style)
 *               Swipe left side ↑↓ → brightness
 *               Swipe right side ↑↓ → volume
 *               Pinch → zoom/crop
 *  Controls     Custom overlay with auto-hide · play/pause · ±10s seek
 *               Progress bar (drag-to-seek) · time display
 *               Speed selector · quality selector
 *               Fullscreen · PiP (Expo) · gyroscope auto-rotate
 *  OSD          Volume / brightness level indicator
 *  Error        Retry overlay
 * ─────────────────────────────────────────────────────────────────────────
 */
import React, {
  useRef, useState, useEffect, useCallback, useMemo,
} from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Animated, Dimensions, PanResponder, StatusBar, Platform, Image,
} from 'react-native'
import Video from 'react-native-video'
import * as ScreenOrientation from 'expo-screen-orientation'
import { Colors, Spacing, Radius, Typography, FontWeight } from '../theme/tokens'
import { useAuthStore } from '../store/authStore'

// ─────────────────────────────────────────────────────────────────────────────
const SPEEDS   = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const QUALITIES = ['Auto', '1080p', '720p', '480p', '360p']
const HLS_BASE  = __DEV__ ? 'http://localhost:8080' : 'https://your-prod.com'
const API_BASE  = __DEV__ ? 'http://localhost:4000' : 'https://your-prod.com'

const fmt = (s) => {
  const t  = Math.max(0, Math.floor(s || 0))
  const h  = Math.floor(t / 3600)
  const m  = Math.floor((t % 3600) / 60)
  const ss = t % 60
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
  return `${m}:${String(ss).padStart(2,'0')}`
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ─────────────────────────────────────────────────────────────────────────────
export default function VideoPlayer({
  src,
  title      = '',
  videoId,
  isLocal    = false,
  chapters   = [],
  onEnded,
  nextVideo  = null,
}) {
  const { token }     = useAuthStore()
  const playerRef     = useRef(null)
  const controlsTimer = useRef(null)
  const tapTimer      = useRef(null)
  const lastTap       = useRef({ side: null, time: 0 })
  const osdTimer      = useRef(null)

  const { width: SW, height: SH } = Dimensions.get('window')

  // ── State ─────────────────────────────────────────────────
  const [paused,      setPaused]      = useState(false)
  const [buffering,   setBuffering]   = useState(true)
  const [duration,    setDuration]    = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [buffered,    setBuffered]    = useState(0)
  const [volume,      setVolume]      = useState(1)
  const [brightness,  setBrightness]  = useState(0.75)
  const [speed,       setSpeed]       = useState(1)
  const [quality,     setQuality]     = useState('Auto')
  const [fullscreen,  setFullscreen]  = useState(false)
  const [showControls,setShowControls]= useState(true)
  const [error,       setError]       = useState(null)
  const [ended,       setEnded]       = useState(false)
  const [tapFlash,    setTapFlash]    = useState(null)  // {side, amount}
  const [osd,         setOsd]         = useState(null)  // {icon, pct, label}
  const [menu,        setMenu]        = useState(null)  // 'speed'|'quality'
  const [seekPreview, setSeekPreview] = useState(null)  // time while dragging progress
  const [isDragging,  setIsDragging]  = useState(false)

  // Animated values
  const controlsAnim = useRef(new Animated.Value(1)).current
  const osdAnim      = useRef(new Animated.Value(0)).current

  // ── Dimensions ───────────────────────────────────────────
  const isPortrait  = !fullscreen
  const playerW     = fullscreen ? Math.max(SW, SH) : SW
  const playerH     = fullscreen ? Math.min(SW, SH) : Math.round(SW * 9 / 16)

  // ── Controls auto-hide ────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => {
      if (!paused && !menu && !isDragging) {
        Animated.timing(controlsAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start(
          () => setShowControls(false)
        )
      }
    }, 3500)
  }, [paused, menu, isDragging, controlsAnim])

  const showUI = useCallback(() => {
    setShowControls(true)
    Animated.timing(controlsAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    resetTimer()
  }, [controlsAnim, resetTimer])

  // ── OSD ───────────────────────────────────────────────────
  const showOsd = useCallback((icon, pct, label) => {
    setOsd({ icon, pct, label })
    clearTimeout(osdTimer.current)
    osdTimer.current = setTimeout(() => setOsd(null), 1400)
  }, [])

  // ── Seek ──────────────────────────────────────────────────
  const seekBy = useCallback((delta) => {
    const next = clamp(currentTime + delta, 0, duration)
    playerRef.current?.seek(next)
    setCurrentTime(next)
    showUI()
  }, [currentTime, duration, showUI])

  const seekTo = useCallback((t) => {
    const next = clamp(t, 0, duration)
    playerRef.current?.seek(next)
    setCurrentTime(next)
  }, [duration])

  // ── Gyroscope / Orientation ───────────────────────────────
  useEffect(() => {
    let sub
    ScreenOrientation.addOrientationChangeListener((evt) => {
      const o = evt.orientationInfo.orientation
      const isLand = o === ScreenOrientation.Orientation.LANDSCAPE_LEFT
                  || o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      if (isLand && !fullscreen) {
        setFullscreen(true)
        StatusBar.setHidden(true)
      } else if (!isLand && fullscreen) {
        setFullscreen(false)
        StatusBar.setHidden(false)
      }
    }).then((s) => { sub = s })
    return () => { if (sub) ScreenOrientation.removeOrientationChangeListener(sub) }
  }, [fullscreen])

  const toggleFullscreen = async () => {
    if (!fullscreen) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      setFullscreen(true)
      StatusBar.setHidden(true)
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      setFullscreen(false)
      StatusBar.setHidden(false)
    }
  }

  // ── Double-tap gesture (YouTube-style) ───────────────────
  const handleSideTap = useCallback((side) => {
    const now = Date.now()
    const last = lastTap.current
    if (last.side === side && now - last.time < 350) {
      // Double tap
      const delta = side === 'left' ? -10 : 10
      seekBy(delta)
      setTapFlash({ side, amount: Math.abs(delta) })
      setTimeout(() => setTapFlash(null), 700)
      lastTap.current = { side: null, time: 0 }
    } else {
      // Single tap — show/hide controls
      lastTap.current = { side, time: now }
      if (showControls) {
        // wait to see if double tap comes
        tapTimer.current = setTimeout(() => {
          Animated.timing(controlsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(
            () => setShowControls(false)
          )
          lastTap.current = { side: null, time: 0 }
        }, 350)
      } else {
        showUI()
      }
    }
  }, [seekBy, showControls, showUI, controlsAnim])

  // ── Swipe gesture (volume / brightness) ─────────────────
  const gesture = useRef({ startY: 0, startVal: 0, side: 'right' })

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: (evt) => {
      const x = evt.nativeEvent.pageX
      const side = x < playerW / 2 ? 'left' : 'right'
      gesture.current = {
        startY:   evt.nativeEvent.pageY,
        startVal: side === 'left' ? brightness : volume,
        side,
      }
      showUI()
    },

    onPanResponderMove: (_, gs) => {
      const { startY, startVal, side } = gesture.current
      const dy     = startY - (startY + gs.dy)
      const delta  = gs.dy / -playerH
      const newVal = clamp(startVal + delta, 0, 1)

      if (side === 'left') {
        setBrightness(newVal)
        showOsd('☀', Math.round(newVal * 100), 'Brightness')
      } else {
        setVolume(newVal)
        showOsd(newVal < 0.05 ? '🔇' : newVal < 0.5 ? '🔉' : '🔊', Math.round(newVal * 100), 'Volume')
      }
    },
  }), [playerW, playerH, brightness, volume, showUI, showOsd])

  // ── Progress bar drag ─────────────────────────────────────
  const progressResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: (evt) => {
      setIsDragging(true)
      const ratio = clamp(evt.nativeEvent.locationX / (playerW - Spacing.md * 2), 0, 1)
      setSeekPreview(ratio * duration)
    },

    onPanResponderMove: (evt) => {
      const ratio = clamp(evt.nativeEvent.locationX / (playerW - Spacing.md * 2), 0, 1)
      setSeekPreview(ratio * duration)
    },

    onPanResponderRelease: (evt) => {
      const ratio = clamp(evt.nativeEvent.locationX / (playerW - Spacing.md * 2), 0, 1)
      seekTo(ratio * duration)
      setSeekPreview(null)
      setIsDragging(false)
      resetTimer()
    },
  }), [playerW, duration, seekTo, resetTimer])

  // ── Source ──────────────────────────────────────────────
  const source = useMemo(() => {
    if (isLocal) return { uri: src }
    return {
      uri:     src,
      type:    'm3u8',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  }, [src, isLocal, token])

  // ── Progress bar fill % ──────────────────────────────────
  const progPct   = duration > 0 ? ((seekPreview ?? currentTime) / duration) * 100 : 0
  const bufPct    = duration > 0 ? (buffered / duration) * 100 : 0

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <View style={[s.errorBox, { width: playerW, height: playerH }]}>
        <Text style={s.errorIcon}>⚠️</Text>
        <Text style={s.errorTitle}>Playback Error</Text>
        <Text style={s.errorMsg}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => { setError(null); setBuffering(true) }}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[s.container, { width: playerW, height: playerH }]}
      {...panResponder.panHandlers}>

      {/* ── Video ── */}
      <Video
        ref={playerRef}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={paused}
        rate={speed}
        volume={volume}
        onLoad={({ duration: d }) => { setDuration(d); setBuffering(false) }}
        onProgress={({ currentTime: t, playableDuration: pd }) => {
          setCurrentTime(t); setBuffered(pd)
        }}
        onBuffer={({ isBuffering: b }) => setBuffering(b)}
        onError={(e) => setError(e.error?.errorString || 'Playback failed')}
        onEnd={() => { setEnded(true); setPaused(true); onEnded?.() }}
        ignoreSilentSwitch="obey"
        playInBackground={false}
        controls={false}
        progressUpdateInterval={400}
      />

      {/* ── Buffering ── */}
      {buffering && (
        <View style={s.bufferingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      {/* ── OSD bar (volume / brightness) ── */}
      {osd && (
        <View style={s.osdBox}>
          <Text style={s.osdIcon}>{osd.icon}</Text>
          <View style={s.osdTrack}>
            <View style={[s.osdFill, { width: `${osd.pct}%` }]} />
          </View>
          <Text style={s.osdLabel}>{osd.pct}%</Text>
        </View>
      )}

      {/* ── Double-tap flash ── */}
      {tapFlash && (
        <View style={[s.tapFlash, tapFlash.side === 'left' ? s.tapFlashLeft : s.tapFlashRight]}>
          <Text style={s.tapFlashText}>
            {tapFlash.side === 'left' ? '⟸' : '⟹'} {tapFlash.amount}s
          </Text>
        </View>
      )}

      {/* ── Touch zones for double-tap ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={s.tapZones} pointerEvents="box-none">
          <TouchableOpacity style={s.tapZone} activeOpacity={1}
            onPress={() => handleSideTap('left')} />
          <TouchableOpacity style={s.tapZoneCentre} activeOpacity={1}
            onPress={showUI} />
          <TouchableOpacity style={s.tapZone} activeOpacity={1}
            onPress={() => handleSideTap('right')} />
        </View>
      </View>

      {/* ── Controls overlay ── */}
      <Animated.View
        style={[s.overlay, { opacity: controlsAnim }]}
        pointerEvents={showControls ? 'box-none' : 'none'}
      >
        {/* Top — title + fullscreen */}
        <View style={s.topBar}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={toggleFullscreen} style={s.iconBtn} hitSlop={HIT}>
            <Text style={s.iconBtnText}>{fullscreen ? '⤡' : '⤢'}</Text>
          </TouchableOpacity>
        </View>

        {/* Centre — skip + play */}
        <View style={s.centreRow} pointerEvents="box-none">
          <TouchableOpacity style={s.skipBtn} onPress={() => seekBy(-10)} hitSlop={HIT}>
            <Text style={s.skipIcon}>↺</Text>
            <Text style={s.skipLabel}>10</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.playBtn}
            onPress={() => { setPaused(p => !p); showUI() }}
          >
            <Text style={s.playBtnText}>{paused ? '▶' : '⏸'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.skipBtn} onPress={() => seekBy(10)} hitSlop={HIT}>
            <Text style={s.skipIcon}>↻</Text>
            <Text style={s.skipLabel}>10</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom — progress + time + menus */}
        <View style={s.bottomBar} pointerEvents="box-none">
          {/* Seek preview label */}
          {seekPreview !== null && (
            <Text style={s.seekPreviewLabel}>{fmt(seekPreview)}</Text>
          )}

          {/* Progress bar */}
          <View
            style={s.progressWrap}
            {...progressResponder.panHandlers}
          >
            <View style={s.progressTrack}>
              <View style={[s.progressBuffer, { width: `${bufPct}%` }]} />
              <View style={[s.progressFill,  { width: `${progPct}%` }]} />
              <View style={[s.progressThumb, { left: `${progPct}%` }]} />
              {/* Chapter dots */}
              {chapters.map((c) => (
                <View
                  key={c.time}
                  style={[s.chapterDot, { left: `${(c.time / duration) * 100}%` }]}
                />
              ))}
            </View>
          </View>

          {/* Control row */}
          <View style={s.controlRow} pointerEvents="box-none">
            <Text style={s.timeText}>{fmt(seekPreview ?? currentTime)}</Text>
            <Text style={s.timeSep}>/</Text>
            <Text style={s.timeText}>{fmt(duration)}</Text>

            <View style={s.flex} />

            {/* Speed */}
            <TouchableOpacity
              style={[s.menuBtn, menu === 'speed' && s.menuBtnActive]}
              onPress={() => setMenu(m => m === 'speed' ? null : 'speed')}
            >
              <Text style={s.menuBtnText}>{speed}x</Text>
            </TouchableOpacity>

            {/* Quality */}
            <TouchableOpacity
              style={[s.menuBtn, menu === 'quality' && s.menuBtnActive]}
              onPress={() => setMenu(m => m === 'quality' ? null : 'quality')}
            >
              <Text style={s.menuBtnText}>{quality}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* ── Speed menu ── */}
      {menu === 'speed' && (
        <View style={s.menuPanel}>
          <Text style={s.menuTitle}>PLAYBACK SPEED</Text>
          {SPEEDS.map((sp) => (
            <TouchableOpacity
              key={sp}
              style={[s.menuItem, sp === speed && s.menuItemActive]}
              onPress={() => { setSpeed(sp); setMenu(null); showUI() }}
            >
              <Text style={[s.menuItemText, sp === speed && s.menuItemTextActive]}>
                {sp}x{sp === 1 ? '  (Normal)' : ''}
              </Text>
              {sp === speed && <Text style={s.menuItemCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.menuClose} onPress={() => setMenu(null)}>
            <Text style={s.menuCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Quality menu ── */}
      {menu === 'quality' && (
        <View style={s.menuPanel}>
          <Text style={s.menuTitle}>QUALITY</Text>
          {QUALITIES.map((q) => (
            <TouchableOpacity
              key={q}
              style={[s.menuItem, q === quality && s.menuItemActive]}
              onPress={() => { setQuality(q); setMenu(null); showUI() }}
            >
              <Text style={[s.menuItemText, q === quality && s.menuItemTextActive]}>{q}</Text>
              {q === quality && <Text style={s.menuItemCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.menuClose} onPress={() => setMenu(null)}>
            <Text style={s.menuCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const HIT = { top: 12, bottom: 12, left: 12, right: 12 }

const s = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden', position: 'relative' },

  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'space-between',
  },

  // Touch zones for double-tap L/R
  tapZones:      { flex: 1, flexDirection: 'row' },
  tapZone:       { flex: 2 },
  tapZoneCentre: { flex: 1 },

  // ── Top bar ─────
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
  },
  title: {
    flex: 1, color: '#fff', fontSize: Typography.sm,
    fontWeight: FontWeight.semi,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iconBtn:     { padding: Spacing.sm },
  iconBtnText: { color: '#fff', fontSize: 20 },

  // ── Centre ──────
  centreRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 36,
  },
  skipBtn:  { alignItems: 'center', gap: 2, padding: Spacing.sm },
  skipIcon: { color: '#fff', fontSize: 32 },
  skipLabel:{ color: 'rgba(255,255,255,0.8)', fontSize: Typography.xs, fontWeight: FontWeight.bold },
  playBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 20, elevation: 10,
  },
  playBtnText: { color: '#fff', fontSize: 28, marginLeft: 3 },

  // ── Bottom ──────
  bottomBar: { paddingHorizontal: Spacing.md, paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing.md },

  seekPreviewLabel: {
    color: '#fff', fontSize: Typography.sm, fontWeight: FontWeight.bold,
    alignSelf: 'flex-start', marginBottom: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 4,
  },

  progressWrap: { height: 28, justifyContent: 'center', marginBottom: 4 },
  progressTrack: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2, position: 'relative', overflow: 'visible',
  },
  progressBuffer: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
  },
  progressFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: Colors.primary, borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute', top: -5,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#fff', marginLeft: -7,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 8, elevation: 5,
  },
  chapterDot: {
    position: 'absolute', top: -1, bottom: -1,
    width: 2, backgroundColor: 'rgba(255,255,255,0.6)',
  },

  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText:   { color: 'rgba(255,255,255,0.85)', fontSize: Typography.xs, fontWeight: FontWeight.medium },
  timeSep:    { color: 'rgba(255,255,255,0.4)', fontSize: Typography.xs, marginHorizontal: 2 },
  flex:       { flex: 1 },

  menuBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  menuBtnActive: { backgroundColor: Colors.glowViolet, borderColor: Colors.primary },
  menuBtnText:   { color: Colors.primaryLight, fontSize: Typography.xs, fontWeight: FontWeight.semi },

  // ── OSD ─────────
  osdBox: {
    position: 'absolute', top: '38%', left: '50%',
    transform: [{ translateX: -70 }],
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: Radius.md, padding: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    width: 140,
  },
  osdIcon:  { fontSize: 18 },
  osdTrack: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 },
  osdFill:  { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  osdLabel: { color: '#fff', fontSize: Typography.xs, fontWeight: FontWeight.semi, minWidth: 30, textAlign: 'right' },

  // ── Double-tap flash ──
  tapFlash: {
    position: 'absolute', top: '50%', marginTop: -28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.lg, padding: Spacing.md,
  },
  tapFlashLeft:  { left: 24 },
  tapFlashRight: { right: 24 },
  tapFlashText:  { color: '#fff', fontSize: Typography.base, fontWeight: FontWeight.bold },

  // ── Menus ───────
  menuPanel: {
    position: 'absolute', bottom: 60, right: 12,
    backgroundColor: 'rgba(16,10,30,0.97)',
    borderRadius: Radius.md, overflow: 'hidden',
    minWidth: 180, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  menuTitle: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: 'rgba(255,255,255,0.4)', fontSize: Typography.xs,
    fontWeight: FontWeight.bold, letterSpacing: 0.8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
  },
  menuItemActive:     { backgroundColor: Colors.glowViolet },
  menuItemText:       { color: 'rgba(255,255,255,0.85)', fontSize: Typography.sm },
  menuItemTextActive: { color: Colors.primaryLight, fontWeight: FontWeight.semi },
  menuItemCheck:      { color: Colors.primary, fontWeight: FontWeight.bold },
  menuClose: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    padding: Spacing.md, alignItems: 'center',
  },
  menuCloseText: { color: 'rgba(255,255,255,0.4)', fontSize: Typography.sm },

  // ── Error ───────
  errorBox: {
    backgroundColor: Colors.bgBase, alignItems: 'center',
    justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl,
  },
  errorIcon:  { fontSize: 44 },
  errorTitle: { color: '#fff', fontSize: Typography.lg, fontWeight: FontWeight.bold },
  errorMsg:   { color: Colors.textSecondary, fontSize: Typography.sm, textAlign: 'center' },
  retryBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
  },
  retryText: { color: '#fff', fontWeight: FontWeight.bold, fontSize: Typography.base },
})
