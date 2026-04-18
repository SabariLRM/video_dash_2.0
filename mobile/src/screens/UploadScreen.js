/**
 * HUB 2.0 Mobile — Upload Screen
 * Pick a video from device storage → upload to API → poll transcoding status.
 */
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import api from '../api/client'
import { Colors, Spacing, Radius, Typography, FontWeight } from '../theme/tokens'

const POLL_MS = 2500

export default function UploadScreen({ navigation }) {
  const [file,      setFile]      = useState(null)
  const [title,     setTitle]     = useState('')
  const [desc,      setDesc]      = useState('')
  const [tags,      setTags]      = useState('')
  const [vis,       setVis]       = useState('private')
  const [stage,     setStage]     = useState('idle')
  const [progress,  setProgress]  = useState(0)
  const [transPct,  setTransPct]  = useState(0)
  const [videoId,   setVideoId]   = useState(null)
  const [error,     setError]     = useState(null)

  const isProcessing = ['uploading', 'queued', 'transcoding', 'ready'].includes(stage)

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true })
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0]
        setFile(asset)
        if (!title) setTitle(asset.name.replace(/\.[^.]+$/, ''))
      }
    } catch { /* cancelled */ }
  }

  const pollStatus = (id) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/upload/${id}/status`)
        setTransPct(data.progress || 0)
        setStage(data.status)
        if (data.status === 'ready') {
          clearInterval(interval)
          setTimeout(() => navigation.navigate('Watch', { videoId: id }), 800)
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setError(data.error || 'Transcoding failed')
        }
      } catch { /* retry */ }
    }, POLL_MS)
  }

  const handleUpload = async () => {
    if (!file) { setError('Please pick a video first'); return }
    if (!title.trim()) { setError('Title is required'); return }
    setError(null); setStage('uploading'); setProgress(0)

    const form = new FormData()
    form.append('video', {
      uri:  Platform.OS === 'ios' ? file.uri.replace('file://', '') : file.uri,
      name: file.name,
      type: file.mimeType || 'video/mp4',
    })
    form.append('title',       title.trim())
    form.append('description', desc.trim())
    form.append('visibility',  vis)
    if (tags.trim()) form.append('tags', tags.trim())

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
    }
  }

  const stageLabel = {
    idle:        '',
    uploading:   `Uploading ${progress}%`,
    queued:      'Queued for transcoding…',
    transcoding: `Transcoding ${transPct}%`,
    ready:       '✅ Done! Redirecting…',
    error:       '',
  }[stage] || ''

  const barPct = stage === 'uploading' ? progress : transPct

  const visOptions = [
    { value: 'private',  label: '🔒 Private'  },
    { value: 'unlisted', label: '🔗 Unlisted' },
    { value: 'public',   label: '🌐 Public'   },
  ]

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>
        <Text style={styles.accent}>Upload</Text> a video
      </Text>

      {/* File picker */}
      <TouchableOpacity style={styles.dropzone} onPress={pickFile} disabled={isProcessing} activeOpacity={0.7}>
        {file
          ? (
            <View style={styles.fileInfo}>
              <Text style={styles.fileIcon}>🎬</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                <Text style={styles.fileSize}>{file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}</Text>
              </View>
              {!isProcessing && (
                <TouchableOpacity onPress={() => setFile(null)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              <Text style={styles.dropIcon}>☁ ↑</Text>
              <Text style={styles.dropLabel}>Tap to pick a video</Text>
              <Text style={styles.dropSub}>MP4, MOV, MKV · Max 2 GB</Text>
            </>
          )
        }
      </TouchableOpacity>

      {/* Form */}
      <View style={styles.form}>
        {[
          { label: 'TITLE *', value: title, setter: setTitle, placeholder: 'Enter a title' },
          { label: 'DESCRIPTION', value: desc, setter: setDesc, placeholder: "What's this video about?", multi: true },
          { label: 'TAGS (comma-separated)', value: tags, setter: setTags, placeholder: 'music, gaming, tutorial' },
        ].map(({ label, value, setter, placeholder, multi }) => (
          <View key={label} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={[styles.input, multi && styles.inputMulti]}
              value={value}
              onChangeText={setter}
              placeholder={placeholder}
              placeholderTextColor={Colors.textMuted}
              multiline={!!multi}
              numberOfLines={multi ? 4 : 1}
              editable={!isProcessing}
            />
          </View>
        ))}

        {/* Visibility */}
        <View style={styles.field}>
          <Text style={styles.label}>VISIBILITY</Text>
          <View style={styles.visRow}>
            {visOptions.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                style={[styles.visBtn, vis === value && styles.visBtnActive]}
                onPress={() => setVis(value)}
                disabled={isProcessing}
              >
                <Text style={[styles.visBtnText, vis === value && styles.visBtnTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Progress */}
        {isProcessing && (
          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>{stageLabel}</Text>
              <Text style={styles.progressPct}>{barPct > 0 ? `${barPct}%` : ''}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${barPct}%` }]} />
            </View>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.uploadBtn, (!file || isProcessing) && styles.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={!file || isProcessing}
          activeOpacity={0.85}
        >
          {isProcessing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.uploadBtnText}>🚀 Upload &amp; Transcode</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  content:   { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 60 },
  pageTitle: {
    fontSize: Typography['2xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.textPrimary,
  },
  accent: { color: Colors.primaryLight },

  dropzone: {
    borderWidth: 2,
    borderColor: Colors.borderSubtle,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgSurface,
    minHeight: 140,
    gap: Spacing.sm,
  },
  dropIcon:  { fontSize: 36, opacity: 0.5 },
  dropLabel: { color: Colors.textSecondary, fontSize: Typography.base, fontWeight: FontWeight.semi },
  dropSub:   { color: Colors.textMuted, fontSize: Typography.sm },

  fileInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, width: '100%' },
  fileIcon: { fontSize: 28 },
  fileName: { color: Colors.textPrimary, fontSize: Typography.sm, fontWeight: FontWeight.semi },
  fileSize: { color: Colors.textMuted, fontSize: Typography.xs },
  removeBtn: { padding: Spacing.sm },
  removeBtnText: { color: Colors.textMuted, fontSize: Typography.base },

  form:  { gap: Spacing.md },
  field: { gap: Spacing.xs },
  label: {
    color: Colors.textSecondary, fontSize: Typography.xs,
    fontWeight: FontWeight.semi, letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.borderSubtle,
    borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: Typography.base,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },

  visRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  visBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgElevated,
  },
  visBtnActive:     { backgroundColor: Colors.glowViolet, borderColor: Colors.primary },
  visBtnText:       { color: Colors.textSecondary, fontSize: Typography.sm },
  visBtnTextActive: { color: Colors.primaryLight, fontWeight: FontWeight.semi },

  progressBlock: { gap: Spacing.sm },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: Colors.textSecondary, fontSize: Typography.sm },
  progressPct:   { color: Colors.primaryLight, fontSize: Typography.sm, fontWeight: FontWeight.semi },
  progressTrack: {
    height: 6, backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full, overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { color: Colors.error, fontSize: Typography.sm },

  uploadBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: Spacing.md + 2, alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 8,
    marginTop: Spacing.sm,
  },
  uploadBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  uploadBtnText: { color: '#fff', fontSize: Typography.base, fontWeight: FontWeight.bold },
})
