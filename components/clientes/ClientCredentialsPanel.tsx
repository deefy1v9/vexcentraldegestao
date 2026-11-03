'use client'
import { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, Copy, Lock } from 'lucide-react'

interface Credential {
  id: string
  type: string
  label: string
  username?: string | null
  password?: string | null
  url?: string | null
  email?: string | null
  notes?: string | null
}

const CRED_TYPES = [
  'wordpress', 'instagram', 'facebook', 'google', 'email', 'hosting', 'outro'
]

export default function ClientCredentialsPanel({
  clientId,
  initialCredentials,
}: {
  clientId: string
  initialCredentials: Credential[]
}) {
  const [credentials, setCredentials] = useState(initialCredentials)
  const [showForm, setShowForm] = useState(false)
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({
    type: 'wordpress', label: '', username: '', password: '', url: '', email: '', notes: ''
  })

  function togglePassword(id: string) {
    setVisiblePasswords((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  async function addCredential() {
    const res = await fetch(`/api/clientes/${clientId}/credenciais`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const cred = await res.json()
      setCredentials((prev) => [...prev, cred])
      setShowForm(false)
      setForm({ type: 'wordpress', label: '', username: '', password: '', url: '', email: '', notes: '' })
    }
  }

  async function deleteCredential(id: string) {
    if (!confirm('Remover esta credencial?')) return
    const res = await fetch(`/api/clientes/${clientId}/credenciais?credId=${id}`, { method: 'DELETE' })
    if (res.ok) setCredentials((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <section className="bg-card rounded-[24px] border border-border p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-marca-suave text-marca-texto"><Lock className="w-[18px] h-[18px]" /></span>
          Cofre de Credenciais
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {showForm && (
        <div className="bg-secondary/60 rounded-[16px] border border-border p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
              <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                className="input text-sm">
                {CRED_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Título/Label *</label>
              <input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                className="input text-sm" placeholder="Ex: WordPress Principal" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Usuário</label>
              <input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                className="input text-sm" placeholder="admin" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Senha</label>
              <input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="input text-sm" placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">URL</label>
              <input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                className="input text-sm" placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="input text-sm" placeholder="email@..." />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notas</label>
              <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="input text-sm" placeholder="Informações adicionais..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-border rounded-lg transition-colors">
              Cancelar
            </button>
            <button onClick={addCredential}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors">
              Salvar
            </button>
          </div>
        </div>
      )}

      {credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma credencial cadastrada</p>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred) => (
            <div key={cred.id} className="border border-border rounded-[16px] p-4 hover:border-subtle/60 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] bg-secondary text-foreground px-2 py-0.5 rounded-md font-medium capitalize">
                    {cred.type}
                  </span>
                  <p className="text-sm font-semibold text-foreground">{cred.label}</p>
                </div>
                <button onClick={() => deleteCredential(cred.id)}
                  className="p-1 text-muted-foreground hover:text-destructive-texto hover:bg-destructive-suave rounded transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {cred.url && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="text-muted-foreground">URL:</span>
                    <a href={cred.url} target="_blank" rel="noopener noreferrer"
                      className="text-marca-texto hover:underline truncate max-w-[160px]">{cred.url}</a>
                  </div>
                )}
                {cred.email && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-mono">{cred.email}</span>
                    <button onClick={() => copyToClipboard(cred.email!)} className="text-muted-foreground hover:text-foreground">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {cred.username && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="text-muted-foreground">Usuário:</span>
                    <span className="font-mono">{cred.username}</span>
                    <button onClick={() => copyToClipboard(cred.username!)} className="text-muted-foreground hover:text-foreground">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {cred.password && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="text-muted-foreground">Senha:</span>
                    <span className="font-mono">
                      {visiblePasswords.has(cred.id) ? cred.password : '••••••••'}
                    </span>
                    <button onClick={() => togglePassword(cred.id)} className="text-muted-foreground hover:text-foreground">
                      {visiblePasswords.has(cred.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    <button onClick={() => copyToClipboard(cred.password!)} className="text-muted-foreground hover:text-foreground">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {cred.notes && (
                  <div className="sm:col-span-2 text-muted-foreground italic">{cred.notes}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
