import type { MetadataRoute } from 'next'

/**
 * Manifest PWA: permite instalar o sistema como atalho/app com o ícone da
 * Vex em dispositivos móveis e desktop.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Central de Gestão | VEX GROWTH',
    short_name: 'Vex Gestão',
    description: 'Sistema interno de gestão para agência de marketing',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#030A8C',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
