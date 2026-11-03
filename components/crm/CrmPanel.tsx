'use client'
import TierBadge from '@/components/ui/TierBadge'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, Plus, X, MessageCircle, Phone, Search,
  Settings, Paperclip, Loader2, Wifi, WifiOff,
  RefreshCw, Copy, Check, PanelRight, ChevronLeft,
} from 'lucide-react'
import ContactSidePanel from './ContactSidePanel'
import DraftBanner from './DraftBanner'
import AiSettingsSection from './AiSettingsSection'
import AvisoConclusaoSection from './AvisoConclusaoSection'
import Header from '@/components/layout/Header'
import { Button } from '@/components/vex/button'
import { TOM, type Tom } from '@/components/vex/vireo'

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

/** Iniciais do contato (até duas letras); número puro vira o fim do número. */
function iniciaisDe(name: string) {
  if (/^[\d+\s()-]+$/.test(name)) return name.replace(/\D/g, '').slice(-2) || '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
}

/** Tom suave do avatar, estável por nome (roxo é da IA e laranja da ação: ficam fora). */
const TONS_CONTATO: Tom[] = ['marca', 'info', 'sucesso', 'atencao', 'neutro']
function tomDoContato(nome: string): Tom {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TONS_CONTATO[h % TONS_CONTATO.length]
}

/** Hora se foi hoje; senão o dia, curto (como a lista do modelo). */
function quandoFoi(dateStr: string | Date) {
  const d = new Date(dateStr)
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
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
  // Filtro da lista, só da tela: todas ou só as que esperam resposta nossa
  const [filtroLista, setFiltroLista] = useState<'todas' | 'aguardando'>('todas')

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
      ? 'bg-success'
      : connState === 'checking'
        ? 'bg-warning'
        : 'bg-destructive'

  const connLabel =
    connState === 'connected'
      ? 'Conectado'
      : connState === 'checking'
        ? 'Verificando...'
        : connState === 'unconfigured'
          ? 'Não configurado'
          : 'Desconectado'

  const aguardando = contacts.filter((c) => c.conversations[0]?.messages[0]?.fromClient).length
  const listaVisivel = filtroLista === 'aguardando'
    ? filteredContacts.filter((c) => c.conversations[0]?.messages[0]?.fromClient)
    : filteredContacts

  return (
    <>
      <Header
        title="CRM — WhatsApp"
        subtitle={`${contacts.length} ${contacts.length === 1 ? 'conversa' : 'conversas'}${aguardando ? ` · ${aguardando} aguardando resposta` : ''} · Gestão de conversas via UAZAPI`}
        acoes={
          <>
            <Button variant="outline" onClick={() => setShowSettings(true)} title="Configurações WhatsApp">
              <Settings /> Configurações
            </Button>
            <Button onClick={() => setShowAddContact(true)}>
              <Plus /> Adicionar contato
            </Button>
          </>
        }
      />

      {/* Respiro embaixo: o botão flutuante do Assistente não cobre o enviar */}
      <div className="flex-1 min-h-0 px-4 sm:px-8 pb-[76px] pt-2 flex">
    <div className="flex-1 flex overflow-hidden relative rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {/* ── Contact sidebar ── */}
      {/* No mobile, a lista ocupa a tela toda; ao abrir uma conversa ela some
          e o chat aparece no lugar (painel único). No desktop (lg+) é uma
          coluna fixa ao lado. */}
      <div className={`w-full lg:w-[320px] border-r border-border bg-card flex-col shrink-0 ${selectedContact ? 'hidden lg:flex' : 'flex'}`}>

        {/* Busca, conexão e o filtro Todas · Aguardando (modelo Vireo) */}
        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border">
          <div className="relative">
            <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              aria-label="Buscar conversa"
              className="w-full h-10 bg-card border border-border rounded-xl pl-9 pr-3 text-[13px] text-foreground placeholder:text-subtle outline-none focus:border-marca focus:ring-2 focus:ring-marca/15"
            />
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/60 p-1" role="tablist" aria-label="Filtrar conversas">
            {([['todas', 'Todas', contacts.length], ['aguardando', 'Aguardando', aguardando]] as const).map(([v, rotulo, n]) => (
              <button
                key={v}
                role="tab"
                aria-selected={filtroLista === v}
                onClick={() => setFiltroLista(v)}
                className={`h-8 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  filtroLista === v ? 'bg-card text-marca-texto shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {rotulo}
                <span className="text-[11px] font-semibold text-subtle tabular">{n}</span>
              </button>
            ))}
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-2 rounded-xl px-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${connDot}`} />
            <span className="text-[12px] text-muted-foreground flex-1">WhatsApp · {connLabel}</span>
            {connState !== 'connected' && connState !== 'checking' && connState !== 'unconfigured' && (
              <button onClick={connectWhatsApp} disabled={connecting} className="text-[11.5px] text-marca-texto font-semibold hover:underline">
                {connecting ? 'Aguarde...' : 'Conectar'}
              </button>
            )}
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto p-2">
          {listaVisivel.length === 0 ? (
            <div className="p-6 text-center">
              <MessageCircle className="w-8 h-8 text-subtle/70 mx-auto mb-2" />
              <p className="text-xs text-subtle">Nenhuma conversa</p>
            </div>
          ) : (
            listaVisivel.map((contact) => {
              const lastMsg = contact.conversations[0]?.messages[0]
              const isSelected = selectedContact?.id === contact.id
              const nome = contactName(contact)
              return (
                <button
                  key={contact.id}
                  onClick={() => selectContact(contact)}
                  className={`relative w-full flex items-start gap-3 px-3 py-3 rounded-2xl transition-colors text-left ${
                    isSelected ? 'bg-marca-suave' : 'hover:bg-secondary/60'
                  }`}
                >
                  {isSelected && <span aria-hidden className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-marca" />}
                  <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 text-[13px] font-bold ${TOM[tomDoContato(nome)]}`}>
                    {iniciaisDe(nome)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13.5px] font-semibold text-foreground truncate flex items-center gap-1.5">{nome} <TierBadge tier={contact.client?.tier} /></p>
                      {lastMsg && <span className="text-[11px] text-subtle shrink-0 tabular">{quandoFoi(lastMsg.sentAt)}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      {lastMsg ? (
                        <p className={`text-[12.5px] truncate ${lastMsg.fromClient ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {!lastMsg.fromClient && 'Você: '}{lastMsg.content}
                        </p>
                      ) : (
                        <p className="text-[12px] text-subtle flex items-center gap-1"><Phone className="w-3 h-3" />{contact.whatsappNumber}</p>
                      )}
                      {lastMsg?.fromClient && (
                        <span className="w-2.5 h-2.5 rounded-full bg-marca shrink-0" title="Última mensagem do cliente: aguardando resposta" aria-label="Aguardando resposta" />
                      )}
                    </div>
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
        <div className="flex-1 flex flex-col bg-background/40 min-w-0">

          {/* Chat header */}
          <div className="bg-card border-b border-border px-4 sm:px-5 py-3 flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Voltar para a lista — só no mobile (painel único). */}
            <button
              onClick={() => setSelectedContact(null)}
              aria-label="Voltar para conversas"
              className="lg:hidden p-1 -ml-1 shrink-0 hover:bg-secondary rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 text-[13px] font-bold ${TOM[tomDoContato(contactName(selectedContact))]}`}>
              {iniciaisDe(contactName(selectedContact))}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-[14px] truncate">{contactName(selectedContact)}</p>
              <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${connDot}`} />
                {selectedContact.whatsappNumber} · WhatsApp
              </p>
            </div>
            <button onClick={refreshMessages} className="p-2 hover:bg-secondary rounded-lg transition-colors" title="Atualizar" aria-label="Atualizar mensagens">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setShowSidePanel((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${showSidePanel ? 'bg-marca-suave text-marca-texto' : 'hover:bg-secondary text-muted-foreground'}`}
              title="Atividades e agendamentos"
              aria-label="Atividades e agendamentos"
              aria-pressed={showSidePanel}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <span className={`w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-3 ${TOM.marca}`}><MessageCircle className="w-6 h-6" /></span>
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
                  <p className="text-xs text-subtle mt-1">Envie uma mensagem para começar</p>
                </div>
              </div>
            ) : (
              messageGroups.map((group) => (
                <div key={group.day}>
                  <div className="flex justify-center my-4">
                    <span className="text-[11px] font-medium text-muted-foreground bg-card px-3 py-1 rounded-full border border-border">
                      {formatDay(group.messages[0].sentAt)}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {group.messages.map((msg) => (
                      <div key={msg.id} className={`flex items-end gap-2 ${msg.fromClient ? 'justify-start' : 'justify-end'}`}>
                        {msg.fromClient && (
                          <span className={`w-7 h-7 rounded-full grid place-items-center shrink-0 text-[10px] font-bold ${TOM[tomDoContato(contactName(selectedContact))]}`}>
                            {iniciaisDe(contactName(selectedContact))}
                          </span>
                        )}
                        <div className={`max-w-[70%] ${msg.fromClient ? '' : 'flex flex-col items-end'}`}>
                          {!msg.fromClient && (
                            <p className="text-[11px] font-semibold mb-1 text-marca-texto">
                              {msg.sender?.name || msg.senderName || 'Colaborador'}
                            </p>
                          )}
                          <div className={`rounded-2xl px-3.5 py-2.5 ${
                            msg.fromClient
                              ? 'bg-card border border-border text-foreground rounded-bl-md'
                              : 'bg-marca-suave border border-marca/15 text-foreground rounded-br-md'
                          }`}>
                            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                          <p className="text-[10.5px] mt-1 text-subtle tabular px-1">
                            {formatTime(msg.sentAt)}
                          </p>
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
          <div className="bg-card border-t border-border px-4 sm:px-5 py-3.5 shrink-0">
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-10 h-10 grid place-items-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Enviar arquivo"
                aria-label="Enviar arquivo"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={sendFile}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />
              <div className="flex-1 bg-card border border-border rounded-xl px-3.5 py-2 focus-within:border-marca focus-within:ring-2 focus-within:ring-marca/15 transition-colors">
                <textarea
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Digite uma mensagem...  (Enter para enviar, Shift+Enter para nova linha)"
                  aria-label="Mensagem"
                  rows={1}
                  className="w-full block bg-transparent text-[13.5px] text-foreground placeholder:text-subtle outline-none resize-none max-h-32 py-0.5"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={sending || !newMsg.trim()}
                aria-label="Enviar mensagem"
                className="w-10 h-10 bg-primary text-primary-foreground rounded-xl grid place-items-center hover:bg-primary-hover transition-colors disabled:opacity-40 shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {showSidePanel && (
          <>
            {/* No mobile o painel de atividades vira um drawer sobreposto;
                no desktop (lg+) é a terceira coluna, no fluxo. */}
            <div
              className="fixed inset-0 z-40 bg-veu lg:hidden"
              onClick={() => setShowSidePanel(false)}
              aria-hidden
            />
            <div className="fixed inset-y-0 right-0 z-50 lg:static lg:z-auto">
              <ContactSidePanel
                key={selectedContact.id}
                contactId={selectedContact.id}
                contactName={contactName(selectedContact)}
                onClose={() => setShowSidePanel(false)}
              />
            </div>
          </>
        )}
        </>
      ) : (
        <div className="flex-1 hidden lg:flex items-center justify-center bg-background/40">
          <div className="text-center">
            <span className={`w-16 h-16 rounded-2xl grid place-items-center mx-auto mb-4 ${TOM.marca}`}>
              <MessageCircle className="w-7 h-7" />
            </span>
            <p className="font-display text-[18px] font-semibold text-foreground">Selecione uma conversa</p>
            <p className="text-sm text-muted-foreground mt-1">Escolha um contato para ver as mensagens</p>
          </div>
        </div>
      )}
    </div>
      </div>

      {/* ── Settings modal (WhatsApp connection) ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-veu flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-[24px] w-full max-w-sm shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-foreground">Configurações WhatsApp</h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-5 h-5 text-subtle" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Credentials */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credenciais UazAPI</p>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">URL do Servidor</label>
                  <input
                    value={credsForm.UAZAPI_URL}
                    onChange={(e) => setCredsForm((f) => ({ ...f, UAZAPI_URL: e.target.value }))}
                    placeholder="https://api.uazapi.com"
                    className="w-full border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-marca bg-card"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Token da Instância</label>
                  <input
                    value={credsForm.UAZAPI_TOKEN}
                    onChange={(e) => setCredsForm((f) => ({ ...f, UAZAPI_TOKEN: e.target.value }))}
                    placeholder="seu-token-aqui"
                    type="password"
                    className="w-full border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-marca bg-card"
                  />
                </div>
                <button
                  onClick={saveCreds}
                  disabled={savingCreds || (!credsForm.UAZAPI_URL && !credsForm.UAZAPI_TOKEN)}
                  className="w-full py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary-hover disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                >
                  {savingCreds ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : credsSaved ? <><Check className="w-3.5 h-3.5" /> Salvo!</> : 'Salvar credenciais'}
                </button>
              </div>

              <div className="border-t border-border pt-3" />

              <AiSettingsSection />

              <div className="border-t border-border pt-3" />

              <AvisoConclusaoSection />

              <div className="border-t border-border pt-3" />

              {/* Status */}
              <div className="flex items-center gap-3 bg-secondary/60 border border-border rounded-xl px-4 py-3">
                <span className={`w-3 h-3 rounded-full shrink-0 ${connDot}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{connLabel}</p>
                  {connJid && <p className="text-xs text-subtle">{connJid.replace('@s.whatsapp.net', '')}</p>}
                </div>
              </div>

              {/* QR code */}
              {qrCode && (
                <div className="flex flex-col items-center gap-3 bg-secondary/60 rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground text-center">Escaneie o QR code no WhatsApp</p>
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR em data URL, gerado na hora */}
                  <img src={qrCode} alt="QR Code WhatsApp" className="w-48 h-48 rounded-lg" />
                  <p className="text-[10px] text-subtle text-center">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
                </div>
              )}

              {/* Connect / Disconnect */}
              {connState !== 'connected' ? (
                <button
                  onClick={connectWhatsApp}
                  disabled={connecting || connState === 'unconfigured'}
                  className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {connecting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando QR...</>
                    : <><Wifi className="w-4 h-4" /> Conectar WhatsApp</>}
                </button>
              ) : (
                <button
                  onClick={disconnectWhatsApp}
                  className="w-full py-2.5 border border-destructive/20 text-destructive-texto text-sm font-semibold rounded-xl hover:bg-destructive-suave transition-colors flex items-center justify-center gap-2"
                >
                  <WifiOff className="w-4 h-4" />
                  Desconectar
                </button>
              )}

              {/* Webhook */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Webhook (receber mensagens)</p>
                <div className="flex items-center gap-1.5 bg-secondary/60 border border-border rounded-lg px-3 py-2">
                  <code className="text-[10px] text-muted-foreground flex-1 truncate">{typeof window !== 'undefined' ? window.location.origin : ''}/api/crm/webhook</code>
                </div>
                <button
                  onClick={setupWebhook}
                  disabled={connState !== 'connected'}
                  className="mt-2 w-full py-2 border border-border text-foreground text-xs font-medium rounded-lg hover:bg-secondary/60 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                >
                  {webhookCopied ? <><Check className="w-3.5 h-3.5 text-success" /> Webhook configurado!</> : <><Copy className="w-3.5 h-3.5" /> Registrar webhook na UazAPI</>}
                </button>
              </div>

              {connState === 'unconfigured' && (
                <div className="bg-warning-suave border border-warning/20 rounded-xl p-3">
                  <p className="text-xs text-warning font-medium mb-1">UAZAPI não configurado</p>
                  <p className="text-[10px] text-warning">Adicione <code className="bg-warning/10 px-1 rounded">UAZAPI_URL</code> e <code className="bg-warning/10 px-1 rounded">UAZAPI_TOKEN</code> no arquivo <code className="bg-warning/10 px-1 rounded">.env</code></p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add contact modal ── */}
      {showAddContact && (
        <div className="fixed inset-0 bg-veu flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-[24px] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-foreground">Adicionar Contato ao CRM</h3>
              <button onClick={() => setShowAddContact(false)} className="p-1 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-5 h-5 text-subtle" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Cliente *</label>
                <select
                  value={addForm.clientId}
                  onChange={(e) => setAddForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground outline-none focus:border-marca"
                >
                  <option value="">Selecione um cliente</option>
                  {availableClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">WhatsApp (com DDI) *</label>
                <input
                  value={addForm.whatsappNumber}
                  onChange={(e) => setAddForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground outline-none focus:border-marca"
                  placeholder="Ex: 5511999999999"
                />
                <p className="text-xs text-subtle mt-1">Formato: 55 + DDD + número (sem espaços ou símbolos)</p>
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0 justify-end">
              <button
                onClick={() => setShowAddContact(false)}
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-secondary/60 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={addContact}
                disabled={!addForm.clientId || !addForm.whatsappNumber}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
