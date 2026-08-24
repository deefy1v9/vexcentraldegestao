'use client'
import TierBadge from '@/components/ui/TierBadge'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, Plus, X, MessageCircle, Phone, Search,
  Settings, Paperclip, Loader2, Wifi, WifiOff,
  RefreshCw, Copy, Check, PanelRight,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import ContactSidePanel from './ContactSidePanel'
import DraftBanner from './DraftBanner'
import AiSettingsSection from './AiSettingsSection'

interface Message {
  id: string
  content: string
  fromClient: boolean
  messageType?: string
  senderName?: string | null
  sender?: { id: string; name: string } | null
  sentAt: string | Date
}

interface Conversation {
  id: string
  title?: string | null
  status: string
  updatedAt: string | Date
  messages: Message[]
}

interface Contact {
  id: string
  whatsappNumber: string
  name?: string | null
  client?: { id: string; name: string; phone?: string | null; tier?: string | null } | null
  conversations: Conversation[]
  lastMessage?: string | Date | null
}

interface AvailableClient {
  id: string
  name: string
  phone?: string | null
}

type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'unconfigured'

function getInitial(name: string) {
  return name.charAt(0).toUpperCase()
}

// Nome de exibição: cliente vinculado, ou nome capturado do WhatsApp, ou o número.
function contactName(c: {
  client?: { name: string } | null
  name?: string | null
  whatsappNumber: string
}) {
  return c.client?.name || c.name || c.whatsappNumber
}

function formatTime(dateStr: string | Date) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDay(dateStr: string | Date) {
  const d = new Date(dateStr)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function groupByDay(msgs: Message[]) {
  const groups: { day: string; messages: Message[] }[] = []
  for (const msg of msgs) {
    const day = new Date(msg.sentAt).toDateString()
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.messages.push(msg)
    else groups.push({ day, messages: [msg] })
  }
  return groups
}

export default function CrmPanel({
  initialContacts,
  availableClients,
}: {
  initialContacts: Contact[]
  availableClients: AvailableClient[]
}) {
  const { data: session } = useSession()
  const [contacts, setContacts] = useState(initialContacts)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [showAddContact, setShowAddContact] = useState(false)
  const [addForm, setAddForm] = useState({ clientId: '', whatsappNumber: '' })
  const [showSettings, setShowSettings] = useState(false)
  const [showSidePanel, setShowSidePanel] = useState(false)

  // Connection state
  const [connState, setConnState] = useState<ConnectionState>('checking')
  const [connJid, setConnJid] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [webhookCopied, setWebhookCopied] = useState(false)

  // UazAPI credentials form
  const [credsForm, setCredsForm] = useState({ UAZAPI_URL: '', UAZAPI_TOKEN: '' })
  const [savingCreds, setSavingCreds] = useState(false)
  const [credsSaved, setCredsSaved] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Load saved credentials ───────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setCredsForm({ UAZAPI_URL: d.UAZAPI_URL || '', UAZAPI_TOKEN: d.UAZAPI_TOKEN || '' }))
      .catch(() => {})
  }, [])

  async function saveCreds() {
    setSavingCreds(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credsForm),
    })
    setSavingCreds(false)
    setCredsSaved(true)
    setTimeout(() => setCredsSaved(false), 3000)
    checkStatus()
  }

  // ─── Connection status polling ────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/crm/status')
      const d = await r.json()
      if (!d.configured) {
        setConnState('unconfigured')
      } else if (d.connected) {
        setConnState('connected')
        setConnJid(d.jid)
        setQrCode(null)
      } else {
        setConnState('disconnected')
      }
    } catch {
      setConnState('disconnected')
    }
  }, [])

  useEffect(() => {
    checkStatus()
    const iv = setInterval(checkStatus, 15000)
    return () => clearInterval(iv)
  }, [checkStatus])

  // ─── Message polling ──────────────────────────────────────────────────────
  const refreshMessages = useCallback(async () => {
    if (!activeConvId) return
    const r = await fetch(`/api/crm/${activeConvId}/mensagens`)
    if (r.ok) setMessages(await r.json())
  }, [activeConvId])

  useEffect(() => {
    if (!activeConvId) return
    const iv = setInterval(refreshMessages, 8000)
    return () => clearInterval(iv)
  }, [activeConvId, refreshMessages])

  // ─── Contact list polling ─────────────────────────────────────────────────
  // Mantém a lista de conversas atualizada quando o webhook captura novos
  // contatos/mensagens, sem precisar recarregar a página.
  const refreshContacts = useCallback(async () => {
    const r = await fetch('/api/crm')
    if (r.ok) setContacts(await r.json())
  }, [])

  useEffect(() => {
    const iv = setInterval(refreshContacts, 15000)
    return () => clearInterval(iv)
  }, [refreshContacts])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ─── Contacts ─────────────────────────────────────────────────────────────
  async function selectContact(contact: Contact) {
    setSelectedContact(contact)
    const convId = contact.conversations[0]?.id ?? null
    setActiveConvId(convId)
    if (convId) {
      const r = await fetch(`/api/crm/${convId}/mensagens`)
      if (r.ok) setMessages(await r.json())
    } else {
      setMessages([])
    }
  }

  async function addContact() {
    if (!addForm.clientId || !addForm.whatsappNumber) return
    const r = await fetch('/api/crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    if (r.ok) window.location.reload()
  }

  // ─── Send message ─────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!newMsg.trim() || !activeConvId || !selectedContact) return
    setSending(true)
    const r = await fetch(`/api/crm/${activeConvId}/mensagens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newMsg, whatsappNumber: selectedContact.whatsappNumber }),
    })
    if (r.ok) {
      const msg = await r.json()
      setMessages((prev) => [...prev, msg])
      setNewMsg('')
    }
    setSending(false)
  }

  // ─── Send media ───────────────────────────────────────────────────────────
  async function sendFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeConvId) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch(`/api/crm/${activeConvId}/media`, { method: 'POST', body: fd })
    if (r.ok) {
      const msg = await r.json()
      setMessages((prev) => [...prev, msg])
    }
    setUploading(false)
    e.target.value = ''
  }

  // ─── WhatsApp connect ─────────────────────────────────────────────────────
  async function connectWhatsApp() {
    setConnecting(true)
    setQrCode(null)
    try {
      const r = await fetch('/api/crm/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const d = await r.json()
      if (d.instance?.qrcode) {
        setQrCode(`data:image/png;base64,${d.instance.qrcode}`)
      }
      checkStatus()
    } catch {}
    setConnecting(false)
  }

  async function disconnectWhatsApp() {
    await fetch('/api/crm/disconnect', { method: 'POST' })
    setConnState('disconnected')
    setConnJid(null)
  }

  async function setupWebhook() {
    const baseUrl = window.location.origin
    await fetch('/api/crm/webhook-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl }),
    })
    navigator.clipboard.writeText(`${baseUrl}/api/crm/webhook`).catch(() => {})
    setWebhookCopied(true)
    setTimeout(() => setWebhookCopied(false), 3000)
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const filteredContacts = contacts.filter(
    (c) =>
      contactName(c).toLowerCase().includes(search.toLowerCase()) ||
      c.whatsappNumber.includes(search),
  )
  const messageGroups = groupByDay(messages)

  const connDot =
    connState === 'connected'
      ? 'bg-green-500'
      : connState === 'checking'
        ? 'bg-yellow-400'
        : 'bg-red-400'

  const connLabel =
    connState === 'connected'
      ? 'Conectado'
      : connState === 'checking'
        ? 'Verificando...'
        : connState === 'unconfigured'
          ? 'Não configurado'
          : 'Desconectado'

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Contact sidebar ── */}
      <div className="w-[280px] border-r border-gray-200 bg-white flex flex-col shrink-0">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-900">Conversas</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSettings(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                title="Configurações WhatsApp"
              >
                <Settings className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={() => setShowAddContact(true)}
                className="w-7 h-7 bg-[#030A8C] text-white rounded-lg flex items-center justify-center hover:bg-[#02077a] transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-2 mb-3 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${connDot}`} />
            <span className="text-xs text-gray-600 flex-1">{connLabel}</span>
            {connState !== 'connected' && connState !== 'checking' && connState !== 'unconfigured' && (
              <button onClick={connectWhatsApp} disabled={connecting} className="text-[10px] text-[#030A8C] font-semibold hover:underline">
                {connecting ? 'Aguarde...' : 'Conectar'}
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-[#030A8C]"
            />
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="p-6 text-center">
              <MessageCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Nenhuma conversa</p>
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const lastMsg = contact.conversations[0]?.messages[0]
              const isSelected = selectedContact?.id === contact.id
              return (
                <button
                  key={contact.id}
                  onClick={() => selectContact(contact)}
                  className={`w-full flex items-start gap-3 px-4 py-3 transition-colors text-left border-b border-gray-100 ${
                    isSelected ? 'bg-[#030A8C]/10 border-l-2 border-l-[#030A8C]' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-9 h-9 bg-[#030A8C] rounded-full flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">{getInitial(contactName(contact))}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">{contactName(contact)} <TierBadge tier={contact.client?.tier} /></p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />
                      {contact.whatsappNumber}
                    </p>
                    {lastMsg && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {!lastMsg.fromClient && '✓ '}{lastMsg.content}
                      </p>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      {selectedContact ? (
        <>
        <div className="flex-1 flex flex-col bg-gray-50">

          {/* Chat header */}
          <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 bg-[#030A8C] rounded-full flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">{getInitial(contactName(selectedContact))}</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">{contactName(selectedContact)}</p>
              <p className="text-xs text-gray-400">{selectedContact.whatsappNumber}</p>
            </div>
            <button onClick={refreshMessages} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Atualizar">
              <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button
              onClick={() => setShowSidePanel((v) => !v)}
              className={`p-1.5 rounded-lg transition-colors ${showSidePanel ? 'bg-blue-50 text-[#030A8C]' : 'hover:bg-gray-100 text-gray-400'}`}
              title="Atividades e agendamentos"
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
            <span className={`w-2 h-2 rounded-full ${connDot}`} />
            <span className="text-xs text-gray-500">WhatsApp</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">Nenhuma mensagem ainda</p>
                  <p className="text-xs text-gray-400 mt-1">Envie uma mensagem para começar</p>
                </div>
              </div>
            ) : (
              messageGroups.map((group) => (
                <div key={group.day}>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                      {formatDay(group.messages[0].sentAt)}
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <div className="space-y-3">
                    {group.messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.fromClient ? 'justify-start' : 'justify-end'}`}>
                        <div className="max-w-[70%]">
                          <p className={`text-[10px] font-semibold mb-1 ${msg.fromClient ? 'text-gray-500' : 'text-[#030A8C] text-right'}`}>
                            {msg.fromClient ? contactName(selectedContact) : (msg.sender?.name || msg.senderName || 'Colaborador')}
                          </p>
                          <div className={`rounded-2xl px-4 py-2.5 ${
                            msg.fromClient
                              ? 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm shadow-sm'
                              : 'bg-[#030A8C] text-white rounded-tr-sm'
                          }`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            <p className={`text-[10px] mt-1 ${msg.fromClient ? 'text-gray-400' : 'text-blue-200'}`}>
                              {formatTime(msg.sentAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugestao da IA, aguardando aprovacao */}
          {activeConvId && <DraftBanner conversationId={activeConvId} onSent={refreshMessages} />}

          {/* Message input */}
          <div className="bg-white border-t border-gray-200 px-5 py-4 shrink-0">
            <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 focus-within:border-[#030A8C] transition-colors">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#030A8C] transition-colors shrink-0 self-end mb-0.5"
                title="Enviar arquivo"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={sendFile}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />
              <textarea
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Digite uma mensagem..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none resize-none max-h-32 py-1"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMsg.trim()}
                className="w-8 h-8 bg-[#030A8C] text-white rounded-xl flex items-center justify-center hover:bg-[#02077a] transition-colors disabled:opacity-40 shrink-0"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">Enter para enviar · Shift+Enter para nova linha</p>
          </div>
        </div>

        {showSidePanel && (
          <ContactSidePanel
            key={selectedContact.id}
            contactId={selectedContact.id}
            contactName={contactName(selectedContact)}
            onClose={() => setShowSidePanel(false)}
          />
        )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-16 h-16 bg-white border border-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-500">Selecione uma conversa</p>
            <p className="text-sm text-gray-400 mt-1">Escolha um contato para ver as mensagens</p>
          </div>
        </div>
      )}

      {/* ── Settings modal (WhatsApp connection) ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Configurações WhatsApp</h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Credentials */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Credenciais UazAPI</p>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">URL do Servidor</label>
                  <input
                    value={credsForm.UAZAPI_URL}
                    onChange={(e) => setCredsForm((f) => ({ ...f, UAZAPI_URL: e.target.value }))}
                    placeholder="https://api.uazapi.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Token da Instância</label>
                  <input
                    value={credsForm.UAZAPI_TOKEN}
                    onChange={(e) => setCredsForm((f) => ({ ...f, UAZAPI_TOKEN: e.target.value }))}
                    placeholder="seu-token-aqui"
                    type="password"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
                  />
                </div>
                <button
                  onClick={saveCreds}
                  disabled={savingCreds || (!credsForm.UAZAPI_URL && !credsForm.UAZAPI_TOKEN)}
                  className="w-full py-2 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                >
                  {savingCreds ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : credsSaved ? <><Check className="w-3.5 h-3.5" /> Salvo!</> : 'Salvar credenciais'}
                </button>
              </div>

              <div className="border-t border-gray-100 pt-3" />

              <AiSettingsSection />

              <div className="border-t border-gray-100 pt-3" />

              {/* Status */}
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <span className={`w-3 h-3 rounded-full shrink-0 ${connDot}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{connLabel}</p>
                  {connJid && <p className="text-xs text-gray-400">{connJid.replace('@s.whatsapp.net', '')}</p>}
                </div>
              </div>

              {/* QR code */}
              {qrCode && (
                <div className="flex flex-col items-center gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-xs text-gray-500 text-center">Escaneie o QR code no WhatsApp</p>
                  <img src={qrCode} alt="QR Code WhatsApp" className="w-48 h-48 rounded-lg" />
                  <p className="text-[10px] text-gray-400 text-center">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
                </div>
              )}

              {/* Connect / Disconnect */}
              {connState !== 'connected' ? (
                <button
                  onClick={connectWhatsApp}
                  disabled={connecting || connState === 'unconfigured'}
                  className="w-full py-2.5 bg-[#030A8C] text-white text-sm font-semibold rounded-xl hover:bg-[#02077a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {connecting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando QR...</>
                    : <><Wifi className="w-4 h-4" /> Conectar WhatsApp</>}
                </button>
              ) : (
                <button
                  onClick={disconnectWhatsApp}
                  className="w-full py-2.5 border border-red-200 text-red-500 text-sm font-semibold rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                >
                  <WifiOff className="w-4 h-4" />
                  Desconectar
                </button>
              )}

              {/* Webhook */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2 font-medium">Webhook (receber mensagens)</p>
                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <code className="text-[10px] text-gray-500 flex-1 truncate">{typeof window !== 'undefined' ? window.location.origin : ''}/api/crm/webhook</code>
                </div>
                <button
                  onClick={setupWebhook}
                  disabled={connState !== 'connected'}
                  className="mt-2 w-full py-2 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                >
                  {webhookCopied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Webhook configurado!</> : <><Copy className="w-3.5 h-3.5" /> Registrar webhook na UazAPI</>}
                </button>
              </div>

              {connState === 'unconfigured' && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-xs text-orange-700 font-medium mb-1">UAZAPI não configurado</p>
                  <p className="text-[10px] text-orange-600">Adicione <code className="bg-orange-100 px-1 rounded">UAZAPI_URL</code> e <code className="bg-orange-100 px-1 rounded">UAZAPI_TOKEN</code> no arquivo <code className="bg-orange-100 px-1 rounded">.env</code></p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add contact modal ── */}
      {showAddContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Adicionar Contato ao CRM</h3>
              <button onClick={() => setShowAddContact(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                <select
                  value={addForm.clientId}
                  onChange={(e) => setAddForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                >
                  <option value="">Selecione um cliente</option>
                  {availableClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp (com DDI) *</label>
                <input
                  value={addForm.whatsappNumber}
                  onChange={(e) => setAddForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                  placeholder="Ex: 5511999999999"
                />
                <p className="text-xs text-gray-400 mt-1">Formato: 55 + DDD + número (sem espaços ou símbolos)</p>
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0 justify-end">
              <button
                onClick={() => setShowAddContact(false)}
                className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={addContact}
                disabled={!addForm.clientId || !addForm.whatsappNumber}
                className="px-4 py-2 text-sm bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50 transition-colors"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
