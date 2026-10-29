import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/activity'
import { AssinaturaErro, criarContrato } from '@/lib/assinatura'
import { ipDe } from '@/lib/mcp/limite'

/**
 * POST (admin, multipart) — sobe o PDF do contrato e a VEX assina do lado
 * dela. Campos: arquivo (PDF), titulo, telefone, clientId (opcional) e
 * revisei ("1"). Nada vai para o cliente aqui: o envio é outro clique.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const form = await req.formData().catch(() => null)
  const arquivo = form?.get('arquivo')
  if (!form || !(arquivo instanceof File)) return NextResponse.json({ error: 'Envie o PDF do contrato.' }, { status: 400 })

  try {
    const criado = await criarContrato({
      user: { id: admin.id, name: admin.name },
      ip: ipDe(req.headers),
      titulo: String(form.get('titulo') ?? ''),
      clientId: String(form.get('clientId') ?? '') || null,
      telefone: String(form.get('telefone') ?? ''),
      fileName: arquivo.name,
      bytes: new Uint8Array(await arquivo.arrayBuffer()),
      revisei: form.get('revisei') === '1',
    })
    await logActivity(admin.id, 'CREATE', 'assinaturas', `Contrato para assinar: ${String(form.get('titulo') ?? '')}`)
    return NextResponse.json({ ok: true, ...criado })
  } catch (e) {
    if (e instanceof AssinaturaErro) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[assinaturas] falha ao criar', e)
    return NextResponse.json({ error: 'Não foi possível guardar o contrato.' }, { status: 500 })
  }
}
