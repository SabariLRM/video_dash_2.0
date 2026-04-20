/* Watch Page — Full Video Player + Metadata + Related Videos */
import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import VideoPlayer from '../components/VideoPlayer'
import api from '../api/client'
import './WatchPage.css'

export default function WatchPage() {
  const { videoId } = useParams()
  const navigate    = useNavigate()
  const [theaterMode, setTheaterMode] = useState(false)

  const [video,   setVideo]   = useState(null)
  const [related, setRelated] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [{ data: vData }, { data: rData }] = await Promise.all([
          api.get(`/videos/${videoId}`),
          api.get(`/videos?limit=8`),
        ])
        setVideo(vData.video)
        setRelated(rData.videos.filter((v) => v._id !== videoId))
      } catch (err) {
        if (err.response?.status === 403) {
          setError('This video is private.')
        } else if (err.response?.status === 404) {
          setError('Video not found.')
        } else {
          setError('Failed to load video.')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
    window.scrollTo(0, 0)
  }, [videoId])

  if (loading) {
    return (
      <div className="watch-page container">
        <div className="watch-skeleton">
          <div className="watch-skeleton__player" />
          <div className="watch-skeleton__meta" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="watch-error container">
        <div className="watch-error__card fade-in">
          <p className="text-2xl">⛔</p>
          <p className="text-lg font-semi">{error}</p>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>Go back</button>
        </div>
      </div>
    )
  }

  // Build the HLS URL — the Nginx proxy serves it authenticated
  const hlsSrc = video.masterPlaylistKey
    ? `/${video.masterPlaylistKey}`
    : null

  const owner = video.ownerId || {}

  return (
    <div className={`watch-page container fade-in${theaterMode ? ' watch-page--theater' : ''}`}>
      <div className="watch-layout">
        {/* Main column */}
        <main className="watch-main">
          {/* Player */}
          <VideoPlayer
            src={hlsSrc}
            poster={video.thumbnailUrl}
            title={video.title}
            videoId={video._id}
            theaterMode={theaterMode}
            onTheaterToggle={() => setTheaterMode(t => !t)}
            chapters={video.chapters || []}
            subtitles={video.subtitles || []}
          />

          {/* Video metadata */}
          <div className="watch-meta">
            <div className="watch-meta__header">
              <div>
                <h1 className="watch-title">{video.title}</h1>
                <div className="watch-stats">
                  <span>{video.viewCount?.toLocaleString() || 0} views</span>
                  <span>·</span>
                  <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                  {video.visibility !== 'public' && (
                    <span className="badge badge-warning">{video.visibility}</span>
                  )}
                </div>
              </div>
              {video.status !== 'ready' && (
                <span className={`badge badge-${video.status === 'failed' ? 'error' : 'warning'}`}>
                  {video.status}
                </span>
              )}
            </div>

            {/* Owner */}
            <div className="watch-owner">
              <div className="watch-owner__avatar">
                {(owner.displayName || owner.username || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semi text-sm">{owner.displayName || owner.username}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>@{owner.username}</p>
              </div>
            </div>

            {/* Description */}
            {video.description && (
              <p className="watch-description text-sm text-secondary">
                {video.description}
              </p>
            )}

            {/* Tags */}
            {video.tags?.length > 0 && (
              <div className="watch-tags">
                {video.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/?q=${encodeURIComponent(tag)}`}
                    className="badge badge-primary"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Rendition info */}
            {video.renditions?.length > 0 && (
              <div className="watch-renditions">
                <p className="text-xs font-semi" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
                  AVAILABLE QUALITY
                </p>
                <div className="watch-rendition-list">
                  {video.renditions.map((r) => (
                    <span key={r.label} className="badge badge-primary">{r.label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Sidebar — related videos */}
        {related.length > 0 && (
          <aside className="watch-sidebar">
            <h2 className="watch-sidebar__title font-semi text-sm">Up Next</h2>
            <div className="watch-related-list">
              {related.map((v) => (
                <Link
                  key={v._id}
                  to={`/watch/${v._id}`}
                  className="watch-related-card"
                  id={`related-${v._id}`}
                >
                  <div className="watch-related-card__thumb">
                    {v.thumbnailUrl
                      ? <img src={v.thumbnailUrl} alt={v.title} loading="lazy" />
                      : <div className="watch-related-card__placeholder">▶</div>
                    }
                  </div>
                  <div className="watch-related-card__meta">
                    <p className="watch-related-card__title">{v.title}</p>
                    <p className="watch-related-card__sub text-xs">
                      {(v.ownerId?.displayName || v.ownerId?.username) || 'Unknown'}
                    </p>
                    <p className="watch-related-card__views text-xs">
                      {v.viewCount?.toLocaleString() || 0} views
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
