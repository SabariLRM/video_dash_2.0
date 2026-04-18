/**
 * HUB 2.0 — Standalone Local Player Page
 * Accessible without authentication — just open and play local files.
 * Security features active: watermark, right-click block, Ctrl+S block.
 */
import { useState } from 'react'
import VideoPlayer from '../components/VideoPlayer'
import { useAuthStore } from '../store/authStore'
import './PlayerPage.css'

const KEYBOARD_SHORTCUTS = [
  { key: 'Space / K',   desc: 'Play / Pause'      },
  { key: 'J',           desc: 'Rewind 10s'         },
  { key: 'L',           desc: 'Forward 10s'        },
  { key: '← / →',     desc: '±5 seconds'          },
  { key: '↑ / ↓',     desc: 'Volume ±10%'         },
  { key: 'F',           desc: 'Fullscreen'          },
  { key: 'T',           desc: 'Theater mode'        },
  { key: 'M',           desc: 'Mute / Unmute'       },
  { key: 'P',           desc: 'Picture-in-Picture'  },
  { key: ', / .',       desc: 'Speed ±0.25x'        },
  { key: '0 – 9',       desc: 'Jump to 0%–90%'      },
  { key: 'C',           desc: 'Subtitles menu'      },
  { key: 'Double-click','desc': '±10s seek (L/R)' },
]

export default function PlayerPage() {
  const { user } = useAuthStore()
  const [theaterMode, setTheaterMode] = useState(false)

  return (
    <div className={`player-page${theaterMode ? ' player-page--theater' : ''}`}>
      {/* Theater mode uses full-width dark backdrop */}
      {theaterMode && <div className="player-page__theater-bg" onClick={() => setTheaterMode(false)} />}

      <div className={`player-page__content${theaterMode ? ' player-page__content--theater' : ''}`}>
        {/* Header */}
        {!theaterMode && (
          <div className="player-page__header fade-in">
            <div>
              <h1 className="player-page__title">
                <span className="gradient-text">Local</span> Media Player
              </h1>
              <p className="player-page__subtitle">
                Play any MP4, MKV, AVI, MOV or WebM file · Full YouTube-style controls · Zero upload
              </p>
            </div>
            <div className="player-page__badges">
              <span className="player-page__badge">🔒 Secure</span>
              <span className="player-page__badge">⚡ Instant</span>
              <span className="player-page__badge">🎬 Local-first</span>
            </div>
          </div>
        )}

        {/* Player — primary component */}
        <div className="player-page__player-wrap fade-in">
          <VideoPlayer
            theaterMode={theaterMode}
            onTheaterToggle={() => setTheaterMode(t => !t)}
            username={user?.username}
          />
        </div>

        {/* Keyboard shortcuts reference */}
        {!theaterMode && (
          <div className="player-page__shortcuts glass-card fade-in">
            <h3 className="player-page__shortcuts-title">⌨ Keyboard Shortcuts</h3>
            <div className="player-page__shortcuts-grid">
              {KEYBOARD_SHORTCUTS.map(({ key, desc }) => (
                <div key={key} className="player-page__shortcut">
                  <kbd className="player-page__kbd">{key}</kbd>
                  <span className="player-page__kbd-desc">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security info */}
        {!theaterMode && (
          <div className="player-page__security glass-card fade-in">
            <h3 className="player-page__shortcuts-title">🛡 Security Features Active</h3>
            <div className="player-page__security-list">
              {[
                ['🔒', 'Right-click download blocked on video element'],
                ['🔒', 'Drag-to-desktop save prevented'],
                ['🔒', 'Ctrl+S shortcut intercepted and blocked'],
                ['🔑', 'Protected Blob URL (obfuscated, cannot be shared or reused)'],
                ['💧', 'Dynamic invisible watermark (session ID + timestamp)'],
                ['👁', 'AES-128 encryption support for streamed content'],
              ].map(([icon, text]) => (
                <div key={text} className="player-page__security-item">
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
