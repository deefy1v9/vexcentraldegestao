import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
})

export const metadata: Metadata = {
  title: 'Central de Gestão | VEX GROWTH',
  description: 'Sistema interno de gestão para agência de marketing',
  // Ícones gerados a partir do símbolo oficial da marca (public/logoaa.png),
  // fundo transparente, sem redesenho. app/favicon.ico cobre o fallback.
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo (ou o do sistema) ANTES do primeiro paint —
            evita flash do tema incorreto no carregamento */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('vex-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${plusJakarta.className} h-full`}>{children}</body>
    </html>
  )
}
