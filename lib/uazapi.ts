import { getSettings } from './settings'

async function getConfig() {
  // UAZAPI_TOKEN é cifrado em repouso (está em SECRET_SETTING_KEYS). getSettings
  // descriptografa na leitura; tokens legados em texto puro passam sem
  // alteração. Ler o valor cru aqui enviava "enc:v1:..." como header de
  // autenticação para a UAZAPI, que respondia 401 — e o WhatsApp não conectava.
  const s = await getSettings(['UAZAPI_URL', 'UAZAPI_TOKEN'])
  return {
    base: (s['UAZAPI_URL'] || process.env.UAZAPI_URL || '').replace(/\/$/, ''),
    token: s['UAZAPI_TOKEN'] || process.env.UAZAPI_TOKEN || '',
  }
}

function h(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', token }
}

export async function isConfigured() {
  const { base, token } = await getConfig()
  return !!(base && token)
}

export async function uazStatus() {
  const { base, token } = await getConfig()
  const r = await fetch(`${base}/instance/status`, { headers: h(token), cache: 'no-store' })
  if (!r.ok) throw new Error('status failed')
  return r.json() as Promise<{
    status: { connected: boolean; loggedIn: boolean; jid: string }
  }>
}

export async function uazConnect(phone?: string) {
  const { base, token } = await getConfig()
  const r = await fetch(`${base}/instance/connect`, {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify(phone ? { phone } : {}),
  })
  return r.json() as Promise<{
    connected: boolean
    loggedIn: boolean
    instance: { qrcode?: string; paircode?: string }
  }>
}

export async function uazDisconnect() {
  const { base, token } = await getConfig()
  const r = await fetch(`${base}/instance/disconnect`, { method: 'POST', headers: h(token) })
  return r.json()
}

export async function uazSetWebhook(url: string) {
  const { base, token } = await getConfig()
  const r = await fetch(`${base}/webhook`, {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ url, events: ['messages', 'connection'], enabled: true }),
  })
  return r.json()
}

export async function uazSendText(number: string, text: string) {
  const { base, token } = await getConfig()
  const r = await fetch(`${base}/send/text`, {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ number, text, delay: 1000 }),
  })
  return r.json()
}

/**
 * Baixa a mídia de uma mensagem recebida. A UAZAPI devolve, conforme a versão,
 * um link temporário ou o arquivo em base64; aqui normalizamos para base64.
 */
export async function uazDownloadMedia(messageId: string): Promise<{ base64: string; mimeType?: string } | null> {
  const { base, token } = await getConfig()
  const r = await fetch(`${base}/message/download`, {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ id: messageId, return_base64: true }),
  })
  if (!r.ok) {
    console.error('[uazapi] download falhou', r.status, (await r.text()).slice(0, 200))
    return null
  }
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  const pick = (...ks: string[]) => ks.map((k) => j[k]).find((v): v is string => typeof v === 'string' && v.length > 0)
  const mimeType = pick('mimetype', 'mimeType', 'mime')
  const b64 = pick('base64', 'fileBase64', 'data')
  if (b64) return { base64: b64.replace(/^data:[^;]+;base64,/, ''), mimeType }
  const url = pick('fileURL', 'fileUrl', 'url', 'mediaUrl')
  if (!url) return null
  return fetchAsBase64(url, mimeType)
}

/** Busca um arquivo por URL (ou data URL) e devolve em base64. */
export async function fetchAsBase64(url: string, mimeHint?: string): Promise<{ base64: string; mimeType?: string } | null> {
  const data = url.match(/^data:([^;]+);base64,(.+)$/)
  if (data) return { base64: data[2], mimeType: data[1] }
  if (!url.startsWith('http')) return { base64: url, mimeType: mimeHint }
  const r = await fetch(url)
  if (!r.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > 25 * 1024 * 1024) return null
  return { base64: buf.toString('base64'), mimeType: r.headers.get('content-type')?.split(';')[0] || mimeHint }
}

export async function uazSendMedia(
  number: string,
  type: string,
  file: string,
  caption?: string,
  docName?: string,
) {
  const { base, token } = await getConfig()
  const r = await fetch(`${base}/send/media`, {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ number, type, file, text: caption, docName }),
  })
  return r.json()
}
