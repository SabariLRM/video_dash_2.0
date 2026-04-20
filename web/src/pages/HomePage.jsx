/* Home Page — Video Discovery Grid */
import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import './HomePage.css'

function VideoCard({ video }) {
  const owner = video.ownerId || {}
  const views = video.viewCount?.toLocaleString() || '0'

  return (
    <Link to={`/watch/${video._id}`} className="video-card" id={`video-${video._id}`}>
      {/* Thumbnail */}
      <div className="video-card__thumb">
        {video.thumbnailUrl
          ? <img src={video.thumbnailUrl} alt={video.title} loading="lazy" />
          : <div className="video-card__thumb-placeholder">
              <span className="video-card__play-icon">▶</span>
            </div>
        }
        <div className="video-card__badge">
          <span className="badge badge-primary">HLS</span>
        </div>
        {video.duration && (
          <span className="video-card__duration">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="video-card__meta">
        <h3 className="video-card__title">{video.title}</h3>
        <div className="video-card__sub">
          <span className="video-card__owner">
            {owner.displayName || owner.username || 'Unknown'}
          </span>
          <span className="video-card__views">{views} views</span>
        </div>
      </div>
    </Link>
  )
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}

export default function HomePage() {
  const [videos,   setVideos]  = useState([])
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState(null)
  const [page,     setPage]    = useState(1)
  const [hasMore,  setHasMore] = useState(true)

  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''

  useEffect(() => {
    setVideos([])
    setPage(1)
    setHasMore(true)
  }, [query])

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page, limit: 20 })
        if (query) params.append('q', query)

        const { data } = await api.get(`/videos?${params}`)
        setVideos((prev) => page === 1 ? data.videos : [...prev, ...data.videos])
        setHasMore(page < data.pages)
      } catch (err) {
        setError('Failed to load videos')
      } finally {
        setLoading(false)
      }
    }
    fetchVideos()
  }, [page, query])

  return (
    <div className="home-page">
      {/* Hero */}
      {!query && (
        <section className="home-hero">
          <div className="container">
            <h1 className="home-hero__title">
              Video for<br />
              <span className="text-black">The Modern Web.</span>
            </h1>
            <p className="home-hero__sub">
              Mux Dash provides the most powerful, adaptive video streaming infrastructure for developers.
            </p>
          </div>
        </section>
      )}

      <div className="container">
        {query && (
          <div className="home-search-label">
            <span className="text-secondary">Results for</span>{' '}
            <strong>"{query}"</strong>
          </div>
        )}

        {/* Grid */}
        {!loading && videos.length === 0 && !error && (
          <div className="home-empty">
            <p className="text-2xl">📭</p>
            <p className="text-secondary">No videos yet.</p>
            <Link to="/upload" className="btn btn-primary" style={{ marginTop: 16 }}>
              Upload the first one
            </Link>
          </div>
        )}

        <div className="videos-grid">
          {videos.map((v, i) => (
            <div
              key={v._id}
              className="fade-in"
              style={{ animationDelay: `${(i % 20) * 40}ms` }}
            >
              <VideoCard video={v} />
            </div>
          ))}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="videos-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="video-card video-card--skeleton glass-card" />
            ))}
          </div>
        )}

        {error && <p className="home-error">{error}</p>}

        {hasMore && !loading && videos.length > 0 && (
          <div className="home-load-more">
            <button
              className="btn btn-ghost"
              onClick={() => setPage((p) => p + 1)}
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
