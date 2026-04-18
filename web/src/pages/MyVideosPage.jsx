/* My Videos Page — Displays the user's uploaded videos (both public and private) */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import './MyVideosPage.css'

export default function MyVideosPage() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editingVideo, setEditingVideo] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', visibility: 'public' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadVideos = async () => {
      try {
        const { data } = await api.get('/videos/my')
        setVideos(data.videos)
      } catch (err) {
        setError('Failed to fetch your videos.')
      } finally {
        setLoading(false)
      }
    }
    loadVideos()
    window.scrollTo(0, 0)
  }, [])

  const handleDelete = async (e, videoId) => {
    e.preventDefault() // prevent navigating to watch page
    if (!window.confirm('Are you sure you want to delete this video? This cannot be undone.')) return
    try {
      await api.delete(`/videos/${videoId}`)
      setVideos((prev) => prev.filter((v) => v._id !== videoId))
    } catch (err) {
      alert('Failed to delete video')
    }
  }

  const openEditModal = (e, video) => {
    e.preventDefault() // prevent navigating
    setEditingVideo(video)
    setEditForm({
      title: video.title || '',
      description: video.description || '',
      visibility: video.visibility || 'public'
    })
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const { data } = await api.patch(`/videos/${editingVideo._id}`, editForm)
      setVideos((prev) => prev.map((v) => (v._id === editingVideo._id ? data.video : v)))
      setEditingVideo(null)
    } catch (err) {
      alert('Failed to update video metadata')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="container min-h-[60vh] flex-center">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="my-videos-page container fade-in">
      <div className="my-videos-header">
        <div>
          <h1 className="text-2xl font-bold">My Videos</h1>
          <p className="text-secondary mt-1">Manage and view your uploaded content</p>
        </div>
        <Link to="/upload" className="btn btn-primary">
          <span>＋</span> Upload Video
        </Link>
      </div>

      {error ? (
        <div className="glass-card text-center text-error p-8">{error}</div>
      ) : videos.length === 0 ? (
        <div className="glass-card my-videos-empty">
          <div className="my-videos-empty-icon">📁</div>
          <h2>No videos uploaded yet</h2>
          <p className="text-secondary">Your uploaded videos (including private ones) will appear here.</p>
          <Link to="/upload" className="btn btn-outline mt-4">Start Uploading</Link>
        </div>
      ) : (
        <div className="my-videos-grid">
          {videos.map((v) => (
            <Link to={`/watch/${v._id}`} key={v._id} className="my-video-card glass-card">
              <div className="my-video-card__thumb">
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt={v.title} loading="lazy" />
                ) : (
                  <div className="my-video-card__placeholder">
                    {v.status === 'transcoding' || v.status === 'queued' ? '⏳' : '▶'}
                  </div>
                )}
                <div className="my-video-card__badges">
                  {v.visibility !== 'public' && (
                    <span className="badge badge-warning">{v.visibility}</span>
                  )}
                  {v.status !== 'ready' && (
                    <span className={`badge badge-${v.status === 'failed' ? 'error' : 'secondary'}`}>
                      {v.status}
                    </span>
                  )}
                </div>
              </div>
              <div className="my-video-card__content">
                <h3 className="my-video-card__title font-semi">{v.title}</h3>
                <p className="my-video-card__stats text-xs text-secondary mt-2 mb-3">
                  {new Date(v.createdAt).toLocaleDateString()} · {v.viewCount || 0} views
                </p>
                <div className="my-video-card__actions flex gap-2">
                  <button className="btn btn-outline text-xs py-1 px-3" onClick={(e) => openEditModal(e, v)}>
                    Edit
                  </button>
                  <button 
                    className="btn text-xs py-1 px-3" 
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }} 
                    onClick={(e) => handleDelete(e, v._id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingVideo && (
        <div className="hub-modal-backdrop" onClick={() => setEditingVideo(null)}>
          <div className="hub-modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Edit Video</h2>
            <form onSubmit={handleUpdate} className="flex flex-col gap-4">
              <div className="form-group flex flex-col gap-1">
                <label className="text-sm font-medium text-secondary">Title</label>
                <input 
                  required 
                  className="input" 
                  value={editForm.title} 
                  onChange={(e) => setEditForm({...editForm, title: e.target.value})} 
                />
              </div>
              <div className="form-group flex flex-col gap-1">
                <label className="text-sm font-medium text-secondary">Description</label>
                <textarea 
                  className="input min-h-[80px]" 
                  value={editForm.description} 
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})} 
                />
              </div>
              <div className="form-group flex flex-col gap-1">
                <label className="text-sm font-medium text-secondary">Visibility</label>
                <select 
                  className="input" 
                  value={editForm.visibility} 
                  onChange={(e) => setEditForm({...editForm, visibility: e.target.value})}
                >
                  <option value="public">Public (Everyone can see)</option>
                  <option value="unlisted">Unlisted (Anyone with link)</option>
                  <option value="private">Private (Only you)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingVideo(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
