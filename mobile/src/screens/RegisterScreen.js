/**
 * HUB 2.0 Mobile — Register Screen
 */
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { useAuthStore } from '../store/authStore'
import { Colors, Spacing, Radius, Typography, FontWeight } from '../theme/tokens'

export default function RegisterScreen({ navigation }) {
  const { register } = useAuthStore()
  const [form,    setForm]    = useState({ username: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  const handleRegister = async () => {
    if (!form.username || !form.email || !form.password) {
      setError('All fields are required'); return
    }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setError(null); setLoading(true)
    try {
      await register(form.username.trim(), form.email.trim().toLowerCase(), form.password)
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBlock}>
          <Text style={styles.logoIcon}>▶</Text>
          <Text style={styles.logoText}>HUB 2.0</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        <View style={styles.card}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}

          {[
            { key: 'username', label: 'USERNAME', placeholder: 'your_handle', type: 'default', secure: false },
            { key: 'email',    label: 'EMAIL',    placeholder: 'you@example.com', type: 'email-address', secure: false },
            { key: 'password', label: 'PASSWORD', placeholder: 'Min 8 characters', type: 'default', secure: true },
          ].map(({ key, label, placeholder, type, secure }) => (
            <View key={key} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[key]}
                onChangeText={(v) => update(key, v)}
                placeholder={placeholder}
                placeholderTextColor={Colors.textMuted}
                keyboardType={type}
                autoCapitalize={key === 'username' ? 'none' : 'none'}
                secureTextEntry={secure}
                returnKeyType="next"
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.buttonText}>Create account</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchRow}
            onPress={() => navigation.replace('Login')}
          >
            <Text style={styles.switchText}>
              Already have an account? <Text style={styles.switchLink}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bgBase },
  container: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.lg, gap: Spacing.xl,
  },
  logoBlock: { alignItems: 'center', gap: Spacing.sm },
  logoIcon:  { fontSize: 48, color: Colors.primary },
  logoText: {
    fontSize: Typography['3xl'], fontWeight: FontWeight.extrabold,
    color: Colors.primaryLight, letterSpacing: -0.5,
  },
  tagline:  { color: Colors.textSecondary, fontSize: Typography.base },
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: Colors.bgSurface, borderRadius: Radius.lg,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.borderSubtle, gap: Spacing.md,
  },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: Radius.sm,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { color: Colors.error, fontSize: Typography.sm },
  field:     { gap: Spacing.xs },
  label: {
    color: Colors.textSecondary, fontSize: Typography.xs,
    fontWeight: FontWeight.semi, letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.borderSubtle,
    borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: Typography.base,
  },
  button: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: Spacing.md, alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: Typography.base, fontWeight: FontWeight.bold },
  switchRow:  { alignItems: 'center', paddingTop: Spacing.sm },
  switchText: { color: Colors.textMuted, fontSize: Typography.sm },
  switchLink: { color: Colors.primaryLight, fontWeight: FontWeight.semi },
})
