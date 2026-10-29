import { NextResponse } from 'next/server'

/** O PDF inline (abre no navegador), sem cache e sem adivinhação de tipo. */
export function respostaDoPdf(pdf: { bytes: Uint8Array; fileName: string }, download = false) {
  const nome = pdf.fileName.replace(/["\r\n]/g, '')
  return new NextResponse(new Uint8Array(pdf.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.bytes.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${nome.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
