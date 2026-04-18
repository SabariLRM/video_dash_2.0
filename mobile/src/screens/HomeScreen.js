/**
 * HUB 2.0 Mobile — Home Screen
 * Displays video discovery grid with search, pagination, and empty state.
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Image, ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native'
import api from '../api/client'
import { Colors, Spacing, Radius, Typography, FontWeight } from '../theme/tokens'

const { width: SCREEN_W } = Dimensions.get('window')
const CARD_W = (SCREEN_W - Spacing.lg * 3) / 2  // 2-column grid

function formatDuration(secs) {
  if (!secs) return ''
  const s = Math.floor(secs)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  return `${m}:${String(s%60).padStart(2,'0')}`
}

function VideoCard({ video, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Thumbnail */}
      <View style={styles.thumb}>
        {video.thumbnailUrl
          ? <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbImg} />
          : <View style={styles.thumbPlaceholder}>
              <Text style={styles.thumbIcon}>▶</Text>
            </View>
        }
        {video.duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(video.duration)}</Text>
          </View>
        ) : null}
      </View>

      {/* Meta */}
      <View style={styles.cardMeta}>
        <Text style={styles.cardTitle} numberOfLines={2}>{video.title}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {video.ownerId?.displayName || video.ownerId?.username || 'Unknown'}
          {'  ·  '}
          {(video.viewCount || 0).toLocaleString()} views
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export default function HomeScreen({ navigation }) {
  const [videos,   setVideos]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [page,     setPage]     = useState(1)
  const [hasMore,  setHasMore]  = useState(true)
  const [error,    setError]    = useState(null)
  const [query,    setQuery]    = useState('')
  const [searchQ,  setSearchQ]  = useState('')

  const load = useCallback(async (pg = 1, q = searchQ, replace = false) => {
    if (pg === 1) setLoading(true)
    try {
      const params = new URLSearchParams({ page: pg, limit: 20 })
      if (q) params.append('q', q)
      const { data } = await api.get(`/videos?${params}`)
      setVideos((prev) => replace || pg === 1 ? data.videos : [...prev, ...data.videos])
      setHasMore(pg < data.pages)
      setPage(pg)
      setError(null)
    } catch {
      setError('Failed to load videos')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [searchQ])

  useEffect(() => { load(1, searchQ, true) }, [searchQ])

  const onRefresh = () => { setRefreshing(true); load(1, searchQ, true) }
  const loadMore  = () => { if (hasMore && !loading) load(page + 1) }

  const doSearch = () => { setSearchQ(query) }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={doSearch}
          placeholder="Search videos…"
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setSearchQ('') }} style={styles.clearBtn}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Error */}
      {error && !loading && (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => load(1, searchQ, true)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Grid */}
      {!error && (
        <FlatList
          data={videos}
          keyExtractor={(v) => v._id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <VideoCard
              video={item}
              onPress={() => navigation.navigate('Watch', { videoId: item._id, title: item.title })}
            />
          )}
          ListEmptyComponent={
            loading
              ? <ActivityIndicator style={{ marginTop: 60 }} color={Colors.primary} size="large" />
              : (
                <View style={styles.centerBox}>
                  <Text style={styles.emptyIcon}>📭</Text>
                  <Text style={styles.emptyText}>
                    {searchQ ? `No results for "${searchQ}"` : 'No videos yet'}
                  </Text>
                </View>
              )
          }
          ListFooterComponent={
            hasMore && !loading && videos.length > 0
              ? <ActivityIndicator style={{ margin: Spacing.lg }} color={Colors.primary} />
              : null
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: Spacing.md,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Spacing.md,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.base,
    paddingVertical: Spacing.sm + 2,
  },
  clearBtn:    { padding: Spacing.sm },
  clearText:   { color: Colors.textMuted, fontSize: Typography.base },
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  row:         { gap: Spacing.md, marginBottom: Spacing.md },

  card: {
    width: CARD_W,
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  thumb: { aspectRatio: 16/9, backgroundColor: Colors.bgElevated, position: 'relative' },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgElevated,
  },
  thumbIcon: { fontSize: 28, color: Colors.primary, opacity: 0.5 },
  durationBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: Radius.sm,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  durationText: { color: '#fff', fontSize: Typography.xs, fontWeight: FontWeight.semi },

  cardMeta: { padding: Spacing.sm, gap: 2 },
  cardTitle: {
    color: Colors.textPrimary, fontSize: Typography.sm,
    fontWeight: FontWeight.semi, lineHeight: 18,
  },
  cardSub: { color: Colors.textMuted, fontSize: Typography.xs },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: Colors.textSecondary, fontSize: Typography.base, textAlign: 'center' },
  errorText: { color: Colors.error, fontSize: Typography.base, textAlign: 'center' },
  retryBtn:  {
    backgroundColor: Colors.bgElevated, borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  retryText: { color: Colors.textSecondary },
})
