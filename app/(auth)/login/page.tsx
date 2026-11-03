'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarCheck, LineChart, Loader2, Sparkles } from 'lucide-react'
import { destinoDepoisDoLogin } from '@/lib/mcp/destino'

/**
 * Entrada da Central no padrão "sign-in cover" do Vireo: à esquerda o
 * formulário com a marca; à direita o painel azul-marinho da VEX. A regra do
 * login não muda: next-auth com credenciais e volta para onde a pessoa ia.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('Email ou senha incorretos')
      setLoading(false)
    } else {
      // Volta para onde a pessoa ia (ex.: autorizar um assistente), só dentro da Central
      router.push(destinoDepoisDoLogin(new URLSearchParams(window.location.search).get('callbackUrl'), window.location.origin))
    }
  }

  const campo = 'w-full h-11 rounded-xl border border-border bg-card px-3.5 t-corpo text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20'

  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Formulário */}
      <main className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl overflow-hidden shrink-0 shadow-sm ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo estático, sem ganho em otimizar */}
            <img src="/logo-mark.png" alt="VEX" className="w-full h-full object-cover" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-[16px] font-semibold tracking-[-0.01em] text-foreground">VEX Growth</span>
            <span className="block t-legenda">Central de Gestão</span>
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-[420px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-marca-texto">Central de Gestão</p>
            <h1 className="mt-2 font-display text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-foreground">Entrar</h1>
            <p className="t-corpo text-muted-foreground mt-2">Faça login para acessar o sistema</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="login-email" className="block t-rotulo font-semibold text-foreground mb-1.5">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={campo}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <label htmlFor="login-senha" className="block t-rotulo font-semibold text-foreground mb-1.5">Senha</label>
                <input
                  id="login-senha"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={campo}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && (
                <p role="alert" className="flex items-center gap-2 t-rotulo text-destructive-texto bg-destructive-suave px-3 py-2.5 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl text-[14px] font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_20px_-8px_var(--primary)]"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>

        <p className="t-legenda">VEX Growth · Marketing digital</p>
      </main>

      {/* Painel da marca */}
      <aside
        className={
          'relative hidden lg:flex flex-col justify-between overflow-hidden m-3 rounded-[28px] p-12 text-white ' +
          // No escuro o --marca clareia; o painel continua azul-marinho fundo
          'bg-[linear-gradient(150deg,var(--marca)_0%,color-mix(in_srgb,var(--marca)_72%,black)_100%)] ' +
          'dark:bg-[linear-gradient(150deg,color-mix(in_srgb,var(--marca)_42%,black)_0%,color-mix(in_srgb,var(--marca)_18%,black)_100%)] dark:ring-1 dark:ring-border'
        }
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full opacity-40 dark:opacity-15 blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--marca) 55%, white)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 w-[380px] h-[380px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--marca) 40%, black)' }}
        />

        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo estático, sem ganho em otimizar */}
          <img src="/logo-blackmode.svg" alt="VEX" className="h-10 w-auto" />
        </div>

        <div className="relative max-w-[460px]">
          <p className="font-display text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
            Clientes, demandas e financeiro da agência num lugar só.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">
            A operação da VEX organizada do contrato à entrega, com a IA ajudando no planejamento.
          </p>

          <ul className="mt-10 grid grid-cols-3 gap-4">
            {[
              { icone: CalendarCheck, rotulo: 'Entregas no prazo' },
              { icone: LineChart, rotulo: 'Financeiro à vista' },
              { icone: Sparkles, rotulo: 'Planejamento com IA' },
            ].map(({ icone: Icone, rotulo }) => (
              <li key={rotulo} className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-4 backdrop-blur-sm">
                <Icone className="w-5 h-5 text-white/90" />
                <p className="mt-3 text-[13px] font-medium leading-snug text-white/90">{rotulo}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12px] text-white/60">Central de Gestão · acesso restrito à equipe</p>
      </aside>
    </div>
  )
}
