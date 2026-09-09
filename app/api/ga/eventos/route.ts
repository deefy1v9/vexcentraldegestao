import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { listEventNames } from '@/lib/ga'
import { GscError } from '@/lib/gsc'
import { suggestWhatsappEvents, LEAD_EVENT_DEFAULT } from '@/lib/ga-core'
import { logActivity } from '@/lib/activity'

/**
 * Eventos que a propriedade registrou nos últimos 90 dias, para o
 * administrador mapear o que é contato. Nada é mapeado automaticamente.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const id = new URL(req.url).searchParams.get('propriedade')
  if (!id) return NextResponse.json({ error: 'Selecione a propriedade.' }, { status: 400 })

  try {
    const eventos = await listEventNames(id)
    const nomes = eventos.map((e) => e.name)
    const mapping = await prisma.gaEventMapping.findUnique({ where: { propertyId: id } })
    return NextResponse.json({
      eventos,
      sugestoes: {
        lead: nomes.includes(LEAD_EVENT_DEFAULT) ? LEAD_EVENT_DEFAULT : null,
        whatsapp: suggestWhatsappEvents(nomes),
        temClickGenerico: nomes.includes('click'),
      },
      mapping,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof GscError ? err.message : 'Não foi possível listar os eventos.' },
      { status: 502 },
    )
  }
}

/** Salva o mapeamento de contato da propriedade. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const id = String(body.propriedade ?? '')
  const property = await prisma.gaProperty.findUnique({ where: { id }, select: { id: true, displayName: true } })
  if (!property) return NextResponse.json({ error: 'Propriedade não vinculada.' }, { status: 404 })

  const leadEvent = body.leadEvent ? String(body.leadEvent).slice(0, 60) : null
  const whatsappEvent = body.whatsappEvent ? String(body.whatsappEvent).slice(0, 60) : null
  const whatsappUrlContains = body.whatsappUrlContains ? String(body.whatsappUrlContains).slice(0, 120) : null
  const notes = body.notes ? String(body.notes).slice(0, 500) : null

  const dados = {
    leadEvent,
    whatsappEvent,
    whatsappUrlContains,
    notes,
    leadStatus: leadEvent ? 'VALIDADO' : 'NAO_VERIFICADO',
    whatsappStatus: whatsappEvent || whatsappUrlContains ? 'VALIDADO' : 'NAO_VERIFICADO',
    leadCheckedAt: leadEvent ? new Date() : null,
    whatsappCheckedAt: whatsappEvent || whatsappUrlContains ? new Date() : null,
  }
  const mapping = await prisma.gaEventMapping.upsert({
    where: { propertyId: property.id },
    create: { propertyId: property.id, ...dados },
    update: dados,
  })

  await logActivity(admin.id, 'mapeou eventos de contato do Analytics', 'SEO', property.displayName)
  return NextResponse.json({ ok: true, mapping })
}
