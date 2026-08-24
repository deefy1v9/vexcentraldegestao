import { prisma } from './prisma'
import { decryptSecret } from './crypto'

async function getConfig() {
  const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
    SELECT key, value FROM "SystemSettings" WHERE key IN ('UAZAPI_URL', 'UAZAPI_TOKEN')
  `
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    base: (map['UAZAPI_URL'] || process.env.UAZAPI_URL || '').replace(/\/$/, ''),
    // O token fica cifrado em SystemSettings; valores legados em texto
    // puro atravessam decryptSecret sem alteracao.
    token: decryptSecret(map['UAZAPI_TOKEN']) || process.env.UAZAPI_TOKEN || '',
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
