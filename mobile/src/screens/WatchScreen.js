/**
 * HUB 2.0 Mobile — Watch Screen
 * Full video player with metadata, related videos, and local file playback option.
 */
import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import VideoPlayer from '../components/VideoPlayer'
import api from '../api/client'
import { Colors, Spacing, Radius, Typography, FontWeight } from '../theme/tokens'

const API_BASE = __DEV__ ? 'http://localhost:8080' : 'https://your-prod.com'

export default function WatchScreen({ route, navigation }) {
  const { videoId, title: routeTitle } = route.params || {}
  const [video,    setVideo]   = useState(null)
  const [loading,  setLoading] = useState(!!videoId)
  const [error,    setError]   = useState(null)
  const [localSrc, setLocalSrc] = useState(null)  // local file URI

  useEffect(() => {
    if (!videoId) { setLoading(false); return }
    api.get(`/videos/${videoId}`)
      .then(({ data }) => setVideo(data.video))
      .catch(() => setError('Failed to load video'))
      .finally(() => setLoading(false))
  }, [videoId])

  const pickLocalFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: false,
      })
      if (!result.canceled && result.assets?.[0]) {
        setLocalSrc(result.assets[0].uri)
        setVideo(null)
      }
    } catch { /* user cancelled */ }
  }

  // Build the HLS URL served through Nginx
  const hlsSrc = video?.masterPlaylistKey
    ? `${API_BASE}/${video.masterPlaylistKey}`
    : null

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const activeSrc   = localSrc || hlsSrc
  const activeTitle = localSrc ? '📁 Local file' : (video?.title || routeTitle || '')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Player */}
      {activeSrc ? (
        <VideoPlayer
          src={activeSrc}
          title={activeTitle}
          videoId={video?._id}
          isLocal={!!localSrc}
        />
      ) : (
        <View style={styles.noSource}>
          <Text style={styles.noSourceText}>
            {video?.status === 'queued' || video?.status === 'transcoding'
              ? '⏳ Still transcoding…'
              : '⛔ Video not available'}
          </Text>
        </View>
      )}

      {/* Local file picker */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.localBtn} onPress={pickLocalFile} activeOpacity={0.8}>
          <Text style={styles.localBtnText}>📁 Play a local file</Text>
        </TouchableOpacity>
        {localSrc && (
          <TouchableOpacity
            style={[styles.localBtn, styles.clearBtn]}
            onPress={() => setLocalSrc(null)}
          >
            <Text style={styles.localBtnText}>✕ Clear local</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Video metadata */}
      {video && (
        <View style={styles.metaCard}>
          {/* Title + status */}
          <View style={styles.metaHeader}>
            <Text style={styles.videoTitle}>{video.title}</Text>
            {video.status !== 'ready' && (
              <View style={[styles.statusBadge,
                video.status === 'failed' ? styles.badgeError : styles.badgeWarning]}>
                <Text style={styles.badgeText}>{video.status.toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Stats */}
          <Text style={styles.statsText}>
            {(video.viewCount || 0).toLocaleString()} views · {new Date(video.createdAt).toLocaleDateString()}
          </Text>

          {/* Owner */}
          <View style={styles.ownerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(video.ownerId?.displayName || video.ownerId?.username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.ownerName}>
                {video.ownerId?.displayName || video.ownerId?.username}
              </Text>
              <Text style={styles.ownerHandle}>@{video.ownerId?.username}</Text>
            </View>
          </View>

          {/* Description */}
          {video.description ? (
            <Text style={styles.description}>{video.description}</Text>
          ) : null}

          {/* Tags */}
          {video.tags?.length > 0 && (
            <View style={styles.tags}>
              {video.tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>#{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Renditions */}
          {video.renditions?.length > 0 && (
            <View style={styles.renditions}>
              {video.renditions.map((r) => (
                <View key={r.label} style={styles.renditionBadge}>
                  <Text style={styles.renditionText}>{r.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  content:   { paddingBottom: 40 },
  centered:  { flex: 1, backgroundColor: Colors.bgBase, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { color: Colors.error, fontSize: Typography.base, textAlign: 'center', padding: Spacing.lg },
  backBtn:   { backgroundColor: Colors.bgElevated, borderRadius: Radius.md,
               paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
               borderWidth: 1, borderColor: Colors.borderSubtle },
  backBtnText:{ color: Colors.textSecondary },

  noSource: {
    aspectRatio: 16/9,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noSourceText: { color: Colors.textMuted, fontSize: Typography.base },

  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    flexWrap: 'wrap',
  },
  localBtn: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  clearBtn: { borderColor: Colors.error },
  localBtnText: { color: Colors.textSecondary, fontSize: Typography.sm, fontWeight: FontWeight.medium },

  metaCard: {
    margin: Spacing.md,
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: Spacing.md,
  },
  metaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  videoTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: FontWeight.bold,
    lineHeight: 24,
  },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  badgeWarning:{ backgroundColor: 'rgba(245,158,11,0.15)' },
  badgeError:  { backgroundColor: 'rgba(239,68,68,0.15)' },
  badgeText:   { fontSize: Typography.xs, fontWeight: FontWeight.semi, color: Colors.warning },

  statsText: { color: Colors.textMuted, fontSize: Typography.sm },

  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { color: '#fff', fontWeight: FontWeight.bold, fontSize: Typography.base },
  ownerName:    { color: Colors.textPrimary, fontSize: Typography.sm, fontWeight: FontWeight.semi },
  ownerHandle:  { color: Colors.textMuted, fontSize: Typography.xs },
  description:  { color: Colors.textSecondary, fontSize: Typography.sm, lineHeight: 20 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  tag:  {
    backgroundColor: Colors.glowViolet, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.borderAccent,
  },
  tagText: { color: Colors.primaryLight, fontSize: Typography.xs, fontWeight: FontWeight.semi },

  renditions: { flexDirection: 'row', gap: Spacing.xs },
  renditionBadge: {
    backgroundColor: Colors.glowViolet, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.borderAccent,
  },
  renditionText: { color: Colors.primaryLight, fontSize: Typography.xs, fontWeight: FontWeight.semi },
})
