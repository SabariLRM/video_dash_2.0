/* Upload Page — Drag-drop upload with real-time transcoding progress */
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import './UploadPage.css'

const POLL_INTERVAL_MS = 2000

export default function UploadPage() {
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  const [file,       setFile]      = useState(null)
  const [meta,       setMeta]      = useState({ title: '', description: '', visibility: 'private', tags: '' })
  const [uploading,  setUploading] = useState(false)
  const [progress,   setProgress]  = useState(0)   // upload progress 0-100
  const [stage,      setStage]     = useState('idle') // idle | uploading | queued | transcoding | done | error
  const [transPct,   setTransPct]  = useState(0)   // transcoding progress
  const [videoId,    setVideoId]   = useState(null)
  const [error,      setError]     = useState(null)
  const [drag,       setDrag]      = useState(false)

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('video/')) return
    setFile(f)
    if (!meta.title) setMeta((m) => ({ ...m, title: f.name.replace(/\.[^.]+$/, '') }))
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false)
    handleFile(e.dataTransfer.files[0])
  }

  // Poll the /api/upload/:videoId/status endpoint
  const pollStatus = (id) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/upload/${id}/status`)
        const computedProgress = data.queueState?.progress || data.progress || 0
        setTransPct(computedProgress)
        setStage(data.status)
        if (data.status === 'ready') {
          clearInterval(interval)
          setTimeout(() => navigate(`/watch/${id}`), 800)
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setError(data.error || 'Transcoding failed')
        }
      } catch { /* retry next tick */ }
    }, POLL_INTERVAL_MS)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setError(null); setUploading(true); setStage('uploading'); setProgress(0)

    const form = new FormData()
    form.append('video', file)
    form.append('title',       meta.title)
    form.append('description', meta.description)
    form.append('visibility',  meta.visibility)
    if (meta.tags) {
      // Send tags as comma-separated string; API parses it
      form.append('tags', meta.tags)
    }

    try {
      const { data } = await api.post('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: ({ loaded, total }) => {
          setProgress(Math.round((loaded / total) * 100))
        },
      })
      setVideoId(data.videoId)
      setStage('queued')
      pollStatus(data.videoId)
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed')
      setStage('error')
    } finally {
      setUploading(false)
    }
  }

  const stageLabels = {
    idle:        'Ready to upload',
    uploading:   `Uploading… ${progress}%`,
    queued:      'Queued for transcoding',
    transcoding: `Transcoding… ${transPct}%`,
    ready:       '✅ Done! Redirecting…',
    error:       '❌ Error',
  }

  const isProcessing = ['uploading', 'queued', 'transcoding', 'ready'].includes(stage)

  return (
    <div className="upload-page container">
      <div className="upload-wrapper fade-in">
        <h1 className="font-extrabold text-5xl tracking-tighter uppercase" style={{ marginBottom: 'var(--space-lg)' }}>
          Upload <span className="text-black">Video</span>
        </h1>

        {/* Drop Zone */}
        {!file ? (
          <div
            id="upload-dropzone"
            className={`upload-dropzone ${drag ? 'upload-dropzone--active' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileRef}
              type="file"
              id="file-input"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div className="upload-dropzone__icon">☁ ↑</div>
            <p className="font-semi text-lg">Drag & drop or click to browse</p>
            <p className="text-secondary text-sm">MP4, MOV, AVI, MKV · Max 2 GB</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="upload-form">
            {/* File preview */}
            <div className="upload-file-preview">
              <span className="upload-file-icon">🎬</span>
              <div>
                <p className="font-semi text-sm">{file.name}</p>
                <p className="text-xs text-secondary">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              {!isProcessing && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setFile(null)}
                >✕</button>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="upload-title" className="form-label">Title *</label>
              <input
                id="upload-title"
                type="text"
                className="input"
                value={meta.title}
                onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                required
                disabled={isProcessing}
              />
            </div>

            <div className="form-field">
              <label htmlFor="upload-desc" className="form-label">Description</label>
              <textarea
                id="upload-desc"
                className="input upload-textarea"
                rows={4}
                value={meta.description}
                onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                disabled={isProcessing}
                placeholder="What's this video about?"
              />
            </div>

            <div className="upload-row">
              <div className="form-field" style={{ flex: 1 }}>
                <label htmlFor="upload-vis" className="form-label">Visibility</label>
                <select
                  id="upload-vis"
                  className="input"
                  value={meta.visibility}
                  onChange={(e) => setMeta({ ...meta, visibility: e.target.value })}
                  disabled={isProcessing}
                >
                  <option value="private">🔒 Private</option>
                  <option value="unlisted">🔗 Unlisted</option>
                  <option value="public">🌐 Public</option>
                </select>
              </div>
              <div className="form-field" style={{ flex: 2 }}>
                <label htmlFor="upload-tags" className="form-label">Tags (comma-separated)</label>
                <input
                  id="upload-tags"
                  type="text"
                  className="input"
                  value={meta.tags}
                  onChange={(e) => setMeta({ ...meta, tags: e.target.value })}
                  disabled={isProcessing}
                  placeholder="music, tutorial, gaming"
                />
              </div>
            </div>

            {/* Progress bar */}
            {isProcessing && (
              <div className="upload-progress">
                <div className="upload-progress__label">
                  <span>{stageLabels[stage]}</span>
                  <span>{stage === 'uploading' ? `${progress}%` : stage === 'transcoding' ? `${transPct}%` : ''}</span>
                </div>
                <div className="upload-progress__bar">
                  <div
                    className="upload-progress__fill"
                    style={{ width: `${stage === 'uploading' ? progress : transPct}%` }}
                  />
                </div>
              </div>
            )}

            {error && <div className="auth-error"><span>⚠</span>{error}</div>}

            <button
              id="btn-upload-submit"
              type="submit"
              className="btn btn-primary"
              disabled={isProcessing}
              style={{ width: '100%', padding: '14px' }}
            >
              {isProcessing
                ? <><div className="spinner" style={{ width: 18, height: 18 }} /> {stageLabels[stage]}</>
                : '🚀 Upload & Transcode'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// End of UploadPage
