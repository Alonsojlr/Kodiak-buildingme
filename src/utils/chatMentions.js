export const normalizeMentionText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const slugifyMentionToken = (value) =>
  normalizeMentionText(value)
    .replace(/[^a-z0-9\s._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const getShortUserName = (value, email = '') => {
  const name = String(value || '').trim()
  if (name && !name.includes('@')) return name.split(/\s+/)[0]

  const emailLocal = String(email || name).split('@')[0] || ''
  const firstPart = emailLocal.split(/[._-]/)[0] || emailLocal
  return firstPart || 'Usuario'
}

const getBaseMentionKey = (user = {}) => {
  const displayName = String(user.name || user.nombre || '').trim()
  const email = String(user.email || '').trim()
  const emailLocal = normalizeMentionText(email.split('@')[0] || '').replace(/[^a-z0-9._-]/g, '')

  const compactName = slugifyMentionToken(getShortUserName(displayName, email)).replace(/\s+/g, '')
  return compactName || emailLocal || 'usuario'
}

const getEmailMentionKey = (user = {}) =>
  normalizeMentionText(String(user.email || '').split('@')[0] || '').replace(/[^a-z0-9._-]/g, '')

export const buildMentionUsers = (users = []) => {
  const seen = new Map()

  return (users || [])
    .filter(Boolean)
    .filter((user) => user.activo !== false)
    .map((user) => {
      const displayName = String(user.name || user.nombre || user.email || 'Usuario').trim()
      const email = String(user.email || '').trim()
      const baseKey = getBaseMentionKey(user)
      const emailKey = getEmailMentionKey(user)
      let mentionKey = baseKey

      if (seen.has(mentionKey)) {
        if (emailKey && !seen.has(emailKey)) {
          mentionKey = emailKey
        } else {
          let count = (seen.get(baseKey) || 1) + 1
          mentionKey = `${baseKey}${count}`
          while (seen.has(mentionKey)) {
            count += 1
            mentionKey = `${baseKey}${count}`
          }
          seen.set(baseKey, count)
        }
      }

      seen.set(mentionKey, 1)

      return {
        id: user.id || user.auth_id || mentionKey,
        displayName,
        email,
        mentionKey,
        searchable: normalizeMentionText(`${displayName} ${email} ${mentionKey}`)
      }
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es', { sensitivity: 'base' }))
}

export const extractMentionTokens = (value) => {
  const normalized = normalizeMentionText(value)
  const matches = normalized.match(/@([a-z0-9._-]+)/g) || []
  return matches.map((match) => match.slice(1)).filter(Boolean)
}

export const getMentionLookup = (mentionUsers = []) =>
  new Map((mentionUsers || []).map((user) => [normalizeMentionText(user.mentionKey), user]))

export const getDetectedMentionUsers = (value, mentionUsers = []) => {
  const lookup = getMentionLookup(mentionUsers)
  const found = []
  const seen = new Set()

  extractMentionTokens(value).forEach((token) => {
    const user = lookup.get(token)
    if (!user || seen.has(user.id)) return
    seen.add(user.id)
    found.push(user)
  })

  return found
}

export const getUnknownMentionTokens = (value, mentionUsers = []) => {
  const lookup = getMentionLookup(mentionUsers)
  return extractMentionTokens(value).filter((token) => !lookup.has(token))
}

export const getMentionSearchState = (value, cursorPosition) => {
  const safeValue = String(value || '')
  const cursor = typeof cursorPosition === 'number' ? cursorPosition : safeValue.length
  const beforeCursor = safeValue.slice(0, cursor)
  const match = beforeCursor.match(/(^|[\s\n])@([a-z0-9._-]*)$/i)
  if (!match) return null

  const prefix = match[1] || ''
  const query = match[2] || ''
  const start = beforeCursor.length - match[0].length + prefix.length

  return {
    query: normalizeMentionText(query),
    start,
    end: cursor
  }
}

export const getMentionSuggestions = (value, cursorPosition, mentionUsers = [], limit = 6) => {
  const state = getMentionSearchState(value, cursorPosition)
  if (!state) return []

  const query = state.query
  return (mentionUsers || [])
    .filter((user) => !query || user.searchable.includes(query) || normalizeMentionText(user.mentionKey).includes(query))
    .slice(0, limit)
}

export const replaceMentionAtCursor = (value, cursorPosition, mentionUser) => {
  const state = getMentionSearchState(value, cursorPosition)
  if (!state || !mentionUser) {
    return { value: String(value || ''), cursor: typeof cursorPosition === 'number' ? cursorPosition : String(value || '').length }
  }

  const mentionText = `@${getShortUserName(mentionUser.displayName, mentionUser.email)} `
  const safeValue = String(value || '')
  const nextValue = safeValue.slice(0, state.start) + mentionText + safeValue.slice(state.end)
  const nextCursor = state.start + mentionText.length

  return { value: nextValue, cursor: nextCursor }
}

export const getMentionSegments = (value, mentionUsers = []) => {
  const safeValue = String(value || '')
  const regex = /(@[a-z0-9._-]+)/gi
  const lookup = getMentionLookup(mentionUsers)
  const segments = []
  let lastIndex = 0
  let match

  while ((match = regex.exec(safeValue)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: safeValue.slice(lastIndex, match.index), isMention: false, user: null })
    }

    const mentionText = match[0]
    const mentionKey = normalizeMentionText(mentionText.slice(1))
    const user = lookup.get(mentionKey) || null
    segments.push({
      text: user ? `@${getShortUserName(user.displayName, user.email)}` : mentionText,
      isMention: Boolean(user),
      user
    })
    lastIndex = match.index + mentionText.length
  }

  if (lastIndex < safeValue.length) {
    segments.push({ text: safeValue.slice(lastIndex), isMention: false, user: null })
  }

  return segments.length ? segments : [{ text: safeValue, isMention: false, user: null }]
}
