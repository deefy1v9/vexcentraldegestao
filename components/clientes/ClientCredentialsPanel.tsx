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
      next.has(id) ? next.delete(id) : next.add(id)
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
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#030A8C]" />
          Cofre de Credenciais
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-sm text-[#030A8C] hover:underline font-medium"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo</label>
              <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                className="input text-sm">
                {CRED_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Título/Label *</label>
              <input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                className="input text-sm" placeholder="Ex: WordPress Principal" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Usuário</label>
              <input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                className="input text-sm" placeholder="admin" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Senha</label>
              <input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="input text-sm" placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">URL</label>
              <input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                className="input text-sm" placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
              <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="input text-sm" placeholder="email@..." />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Notas</label>
              <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="input text-sm" placeholder="Informações adicionais..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
              Cancelar
            </button>
            <button onClick={addCredential}
              className="px-3 py-1.5 text-sm bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] transition-colors">
              Salvar
            </button>
          </div>
        </div>
      )}

      {credentials.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nenhuma credencial cadastrada</p>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred) => (
            <div key={cred.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-50 text-[#030A8C] px-2 py-0.5 rounded-full font-medium capitalize">
                    {cred.type}
                  </span>
                  <p className="text-sm font-semibold text-gray-900">{cred.label}</p>
                </div>
                <button onClick={() => deleteCredential(cred.id)}
                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {cred.url && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <span className="text-gray-400">URL:</span>
                    <a href={cred.url} target="_blank" rel="noopener noreferrer"
                      className="text-[#030A8C] hover:underline truncate max-w-[160px]">{cred.url}</a>
                  </div>
                )}
                {cred.email && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <span className="text-gray-400">Email:</span>
                    <span className="font-mono">{cred.email}</span>
                    <button onClick={() => copyToClipboard(cred.email!)} className="text-gray-400 hover:text-gray-700">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {cred.username && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <span className="text-gray-400">Usuário:</span>
                    <span className="font-mono">{cred.username}</span>
                    <button onClick={() => copyToClipboard(cred.username!)} className="text-gray-400 hover:text-gray-700">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {cred.password && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <span className="text-gray-400">Senha:</span>
                    <span className="font-mono">
                      {visiblePasswords.has(cred.id) ? cred.password : '••••••••'}
                    </span>
                    <button onClick={() => togglePassword(cred.id)} className="text-gray-400 hover:text-gray-700">
                      {visiblePasswords.has(cred.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    <button onClick={() => copyToClipboard(cred.password!)} className="text-gray-400 hover:text-gray-700">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {cred.notes && (
                  <div className="col-span-2 text-gray-500 italic">{cred.notes}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
