import { createClient } from '@supabase/supabase-js'
import * as webpush from '@negrel/webpush'
import { corsHeaders } from '../_shared/cors.ts'

type PushSubscriptionRecord = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

const encoder = new TextEncoder()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
})

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

const mentionToken = (value: unknown) => normalize(value)
  .replace(/[^a-z0-9\s._-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const getShortName = (value: unknown, email: unknown = '') => {
  const name = String(value || '').trim()
  if (name && !name.includes('@')) return name.split(/\s+/)[0]

  const emailLocal = String(email || name).split('@')[0] || ''
  return emailLocal.split(/[._-]/)[0] || emailLocal || 'Usuario'
}

const getMentionKey = (user: { nombre?: string | null, email?: string | null }) => {
  const name = mentionToken(getShortName(user.nombre, user.email)).replace(/\s+/g, '')
  const email = normalize(String(user.email || '').split('@')[0]).replace(/[^a-z0-9._-]/g, '')
  return name || email || 'usuario'
}

const getEmailMentionKey = (email: unknown) => normalize(String(email || '').split('@')[0]).replace(/[^a-z0-9._-]/g, '')

const extractMentions = (message: unknown) => (normalize(message).match(/@([a-z0-9._-]+)/g) || [])
  .map((item) => item.slice(1))
  .filter(Boolean)

const getMentionedUserIds = (message: string, users: Array<Record<string, unknown>>) => {
  const mentions = new Set(extractMentions(message))
  if (!mentions.size) return []

  const seenKeys = new Map<string, number>()
  const mentionedUserIds = new Set<string>()

  users
    .filter((user) => user.activo !== false && user.auth_id)
    .forEach((user) => {
      const baseKey = getMentionKey({ nombre: String(user.nombre || ''), email: String(user.email || '') })
      const emailKey = getEmailMentionKey(user.email)
      let currentKey = baseKey

      if (seenKeys.has(currentKey)) {
        if (emailKey && !seenKeys.has(emailKey)) {
          currentKey = emailKey
        } else {
          let count = (seenKeys.get(baseKey) || 1) + 1
          currentKey = `${baseKey}${count}`
          while (seenKeys.has(currentKey)) {
            count += 1
            currentKey = `${baseKey}${count}`
          }
          seenKeys.set(baseKey, count)
        }
      }

      seenKeys.set(currentKey, 1)
      if (mentions.has(currentKey)) mentionedUserIds.add(String(user.auth_id))
    })

  return Array.from(mentionedUserIds)
}

const getApplicationServer = async () => {
  const rawKeys = Deno.env.get('VAPID_KEYS')
  const contactInformation = Deno.env.get('VAPID_CONTACT')
  if (!rawKeys || !contactInformation) {
    throw new Error('Faltan los secretos VAPID_KEYS o VAPID_CONTACT.')
  }

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(rawKeys), { extractable: false })
  return webpush.ApplicationServer.new({ contactInformation, vapidKeys })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado.' }, 401)

  const supabaseCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await supabaseCaller.auth.getUser()
  if (authError || !user) return json({ error: 'No autorizado.' }, 401)

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    const action = String(body?.action || '')
    const applicationServer = await getApplicationServer()

    if (action === 'get-vapid-key') {
      return json({ publicKey: await webpush.exportApplicationServerKey(applicationServer.vapidKeys) })
    }

    if (action === 'subscribe') {
      const subscription = body?.subscription
      const endpoint = String(subscription?.endpoint || '')
      const p256dh = String(subscription?.keys?.p256dh || '')
      const auth = String(subscription?.keys?.auth || '')
      if (!endpoint || !p256dh || !auth) return json({ error: 'Suscripción inválida.' }, 400)

      const { error } = await supabaseAdmin
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: req.headers.get('user-agent') || null
        }, { onConflict: 'endpoint' })

      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'send-test') {
      const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', user.id)
      if (subscriptionsError) throw subscriptionsError

      let sent = 0
      const expiredIds: string[] = []
      const notification = JSON.stringify({
        title: 'Kodiak',
        body: 'Las alertas push están activas en este teléfono.',
        url: Deno.env.get('APP_URL') || req.headers.get('origin') || '/',
        tag: 'kodiak-push-test'
      })

      await Promise.all((subscriptions || []).map(async (subscription: PushSubscriptionRecord) => {
        try {
          const subscriber = applicationServer.subscribe({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          })
          await subscriber.pushTextMessage(notification, {
            urgency: webpush.Urgency.High,
            ttl: 3600,
            topic: 'kodiak-push-test'
          })
          sent += 1
        } catch (error) {
          const status = (error as { response?: Response })?.response?.status
          if (status === 404 || status === 410) expiredIds.push(subscription.id)
          console.error('No se pudo enviar push de prueba:', error)
        }
      }))

      if (expiredIds.length) {
        await supabaseAdmin.from('push_subscriptions').delete().in('id', expiredIds)
      }

      return json({ ok: true, sent })
    }

    if (action !== 'notify-mentions') return json({ error: 'Acción inválida.' }, 400)

    const message = String(body?.message || '').trim()
    const contextType = body?.contextType === 'forecast' ? 'forecast' : 'protocolo'
    const contextId = String(body?.contextId || '').trim()
    if (!message || !contextId) return json({ error: 'Faltan datos de la mención.' }, 400)

    const { data: users, error: usersError } = await supabaseAdmin
      .from('usuarios')
      .select('auth_id, nombre, email, activo, created_at')
      .eq('activo', true)
      .order('created_at', { ascending: false })
    if (usersError) throw usersError

    const recipientIds = getMentionedUserIds(message, users || [])
      .filter((recipientId) => recipientId !== user.id)
    if (!recipientIds.length) return json({ ok: true, sent: 0 })

    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', recipientIds)
    if (subscriptionsError) throw subscriptionsError

    const sender = getShortName(user.user_metadata?.nombre, user.email)
    const projectName = String(body?.projectName || '').trim()
    const section = contextType === 'forecast' ? 'Draft' : 'Protocolo'
    const recipientNames = (users || [])
      .filter((mentionedUser) => recipientIds.includes(String(mentionedUser.auth_id)))
      .map((mentionedUser) => getShortName(mentionedUser.nombre, mentionedUser.email))
    const messagePreview = message
      .replace(/@[a-z0-9._-]+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    const origin = Deno.env.get('APP_URL') || req.headers.get('origin') || ''
    const url = origin
      ? `${origin.replace(/\/$/, '')}/?push=${contextType}&id=${encodeURIComponent(contextId)}`
      : '/'
    const notification = JSON.stringify({
      title: `Mensaje en ${section}${projectName ? `: ${projectName}` : ''}`,
      body: `${sender} dice${messagePreview ? `: ${messagePreview.slice(0, 140)}` : ''}${recipientNames.length ? ` a ${recipientNames.join(', ')}` : ''}`,
      url,
      tag: `kodiak-${contextType}-${contextId}`
    })

    const expiredIds: string[] = []
    let sent = 0
    await Promise.all((subscriptions || []).map(async (subscription: PushSubscriptionRecord) => {
      try {
        const subscriber = applicationServer.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        })
        await subscriber.pushTextMessage(notification, {
          urgency: webpush.Urgency.High,
          ttl: 3600,
          topic: `kodiak-${contextType}-${contextId}`.slice(0, 32)
        })
        sent += 1
      } catch (error) {
        const status = (error as { response?: Response })?.response?.status
        if (status === 404 || status === 410) expiredIds.push(subscription.id)
        console.error('No se pudo enviar push:', error)
      }
    }))

    if (expiredIds.length) {
      await supabaseAdmin.from('push_subscriptions').delete().in('id', expiredIds)
    }

    return json({ ok: true, sent })
  } catch (error) {
    console.error('Error de notificaciones push:', error)
    return json({ error: error instanceof Error ? error.message : 'Error interno.' }, 500)
  }
})
