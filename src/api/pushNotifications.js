import { supabase } from '../lib/supabaseClient'

const base64UrlToUint8Array = (value) => {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')
  const binary = window.atob(normalized)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

const getRegistration = async () => {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Este navegador no admite notificaciones.')
  }

  return navigator.serviceWorker.ready
}

const invokePushFunctionWithSession = async (body, session) => {
  return supabase.functions.invoke('push-notifications', {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
    }
  })
}

const invokePushFunction = async (body) => {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente para activar alertas.')
  }

  let result = await invokePushFunctionWithSession(body, session)
  const responseStatus = result.error?.context?.status
  if (!result.error || responseStatus !== 401) {
    if (result.error) throw result.error
    return result.data
  }

  // A stale browser session can survive in local storage after a token rotation.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError || !refreshed.session?.access_token) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente para activar alertas.')
  }

  result = await invokePushFunctionWithSession(body, refreshed.session)
  if (result.error) throw result.error
  return result.data
}

export const getPushNotificationStatus = async () => {
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
    return { supported: false, permission: 'unsupported', subscribed: false }
  }

  const registration = await getRegistration()
  const subscription = await registration.pushManager.getSubscription()
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription)
  }
}

export const subscribeToPushNotifications = async () => {
  if (!('Notification' in window) || !('PushManager' in window)) {
    throw new Error('Este navegador no admite notificaciones push.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Debes permitir las notificaciones para recibir alertas.')
  }

  const registration = await getRegistration()
  const settings = await invokePushFunction({ action: 'get-vapid-key' })
  const applicationServerKey = base64UrlToUint8Array(settings?.publicKey)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  })

  await invokePushFunction({
    action: 'subscribe',
    subscription: subscription.toJSON()
  })

  return getPushNotificationStatus()
}

export const sendChatMentionPush = async ({ message, contextType, contextId, projectName }) => {
  if (!message || !contextType || !contextId) return null

  return invokePushFunction({
    action: 'notify-mentions',
    message,
    contextType,
    contextId,
    projectName
  })
}

export const sendPushNotificationTest = async () => invokePushFunction({ action: 'send-test' })
