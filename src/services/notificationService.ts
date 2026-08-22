// @ts-nocheck - Stub implementation: react-native-push-notification removed due to Firebase dependency crash
import { Platform } from 'react-native'

let initialized = false

export async function initNotifications(): Promise<void> {
  if (initialized) return
  // Push notification module removed - Firebase not configured in this project.
  // WebSocket-based messaging handles real-time delivery while app is foregrounded.
  console.log('[Notification] Push notifications disabled (Firebase not configured)')
  initialized = true
}

export async function showPushNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  // No-op: push notification module removed
  console.log(`[Notification] ${title}: ${body}`)
}

export function getInitialized(): boolean {
  return initialized
}
