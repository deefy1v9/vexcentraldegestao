import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { sendMail, baseTemplate, smtpConfigured, MAIL_REPLY_TO } from '@/lib/mailer'
import { formatBRL, formatDateBR, addDaysISO, spTodayISO, proposalMailRef } from '@/lib/proposal-core'
import {
  convertProspect, createVersion, generateDocument, logEvent, nextNumber, ProposalError,
  setStatus, type RecipientSnapshot,
} from '@/lib/proposals'

/**
 * Ações sobre uma proposta (admin):
 * POST { action: 'status' | 'versao' | 'duplicar' | 'enviar' | 'converter' }
 *
 * Envio usa o e-mail já configurado (remetente financeiro) e é idempotente
 * por proposta+versão: clique duplo não manda duas vezes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: { items: { orderBy: { order: 'asc' } } },
  })
  if (!proposal) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 })

  try {
    /* ------------------------------- status ------------------------------- */
    if (action === 'status') {
      const status = String(body.status ?? '')
      const updated = await setStatus(id, status, admin, body.reason ? String(body.reason).slice(0, 300) : undefined)
      return NextResponse.json({ ok: true, status: updated.status })
    }

    /* ------------------------------- versão ------------------------------- */
    if (action === 'versao') {
      const updated = await createVersion(id, admin, body.note ? String(body.note).slice(0, 300) : undefined)
      return NextResponse.json({ ok: true, version: updated.currentVersion })
    }

    /* ------------------------------ duplicar ------------------------------ */
    if (action === 'duplicar') {
      const today = spTodayISO()
      const year = Number(today.slice(0, 4))
      let created: { id: string; number: string } | null = null
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        const { seq, number } = await nextNumber(proposal.kind as 'PROPOSTA' | 'ADITIVO', year)
        try {
          created = await prisma.proposal.create({
            data: {
              number, kind: proposal.kind, year, seq,
              clientId: proposal.clientId, prospectId: proposal.prospectId,
              parentId: proposal.parentId, templateId: proposal.templateId,
              status: 'RASCUNHO',
              snapshot: proposal.snapshot as Prisma.InputJsonValue,
              issueDate: new Date(`${today}T12:00:00Z`),
              validUntil: new Date(`${addDaysISO(today, 15)}T12:00:00Z`),
              startDate: proposal.startDate,
              paymentDay: proposal.paymentDay,
              paymentTerms: proposal.paymentTerms,
              notes: proposal.notes,
              discountCents: proposal.discountCents,
              discountPercent: proposal.discountPercent,
              monthlyCents: proposal.monthlyCents,
              setupCents: proposal.setupCents,
              totalCents: proposal.totalCents,
              itemsDiscountCents: proposal.itemsDiscountCents,
              months: proposal.months,
              createdById: admin.id,
              items: {
                create: proposal.items.map((i) => ({
                  serviceId: i.serviceId, order: i.order, name: i.name, description: i.description,
                  scope: i.scope, deliverables: i.deliverables, quantity: i.quantity,
                  monthlyCents: i.monthlyCents, setupCents: i.setupCents, discountCents: i.discountCents,
                  discountPercent: i.discountPercent, months: i.months, periodicity: i.periodicity,
                  startDate: i.startDate, notes: i.notes, changeType: i.changeType,
                  previousMonthlyCents: i.previousMonthlyCents, previousMonths: i.previousMonths,
                })),
              },
            },
            select: { id: true, number: true },
          })
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err
        }
      }
      if (!created) return NextResponse.json({ error: 'Não foi possível duplicar agora.' }, { status: 409 })
      await logEvent(created.id, 'CRIACAO', `Duplicada de ${proposal.number} por ${admin.name}`, admin.id)
      return NextResponse.json({ ok: true, id: created.id, number: created.number })
    }

    /* ------------------------------- enviar ------------------------------- */
    if (action === 'enviar') {
      const snap = proposal.snapshot as unknown as RecipientSnapshot
      const to = String(body.to ?? snap?.email ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return NextResponse.json({ error: 'Informe um e-mail de destino válido.' }, { status: 400 })
      }
      if (!(await smtpConfigured('financeiro'))) {
        return NextResponse.json({ error: 'E-mail não configurado no servidor.' }, { status: 409 })
      }

      // Garante o PDF da versão atual antes de anexar
      await generateDocument(id, 'PDF', admin)
      const doc = await prisma.proposalDocument.findUnique({
        where: { proposalId_version_format: { proposalId: id, version: proposal.currentVersion, format: 'PDF' } },
      })
      if (!doc) return NextResponse.json({ error: 'Documento não disponível.' }, { status: 400 })

      const message = body.message ? String(body.message).slice(0, 2000) : ''
      const isAddendum = proposal.kind === 'ADITIVO'
      const html = baseTemplate(
        isAddendum ? 'Termo aditivo' : 'Sua proposta comercial',
        `<p>Olá, ${snap.contactName || snap.name}.</p>
         ${message ? `<p>${message.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : ''}
         <p>Segue em anexo ${isAddendum ? 'o termo aditivo' : 'a proposta comercial'} <strong>${proposal.number}</strong>.</p>
         <p><strong>Resumo:</strong><br>
         ${proposal.monthlyCents > 0 ? `Mensalidade: ${formatBRL(proposal.monthlyCents)}${proposal.months > 0 ? ` por ${proposal.months} meses` : ''}<br>` : ''}
         ${proposal.setupCents > 0 ? `Pagamento único: ${formatBRL(proposal.setupCents)}<br>` : ''}
         Valor total: ${formatBRL(proposal.totalCents)}<br>
         Validade: ${formatDateBR(proposal.validUntil)}</p>
         <p>Qualquer dúvida, é só responder este e-mail.</p>`,
        MAIL_REPLY_TO,
      )

      const result = await sendMail({
        to,
        subject: `${isAddendum ? 'Termo aditivo' : 'Proposta comercial'} VEX Growth — ${snap.name}`,
        html,
        profile: 'financeiro',
        kind: 'proposta',
        // Idempotência: mesma proposta + versão não sai duas vezes
        refId: proposalMailRef(id, proposal.currentVersion),
        attachments: [{ filename: doc.fileName, content: Buffer.from(doc.bytes), contentType: 'application/pdf' }],
      })

      if (result.skipped) {
        return NextResponse.json({ ok: true, skipped: true, message: 'Esta versão já foi enviada para o cliente.' })
      }

      await prisma.proposal.update({
        where: { id },
        data: { sentAt: new Date(), status: proposal.status === 'APROVADA' ? proposal.status : 'ENVIADA' },
      })
      // Log sem dados sensíveis: só o domínio do destinatário
      await logEvent(id, 'ENVIO', `Enviada por ${admin.name} para ***@${to.split('@')[1]}`, admin.id, {
        version: proposal.currentVersion,
      })
      await logActivity(admin.id, `enviou a proposta ${proposal.number}`, 'Propostas', proposal.number)
      return NextResponse.json({ ok: true, sent: true })
    }

    /* ------------------------------ converter ------------------------------ */
    if (action === 'converter') {
      const result = await convertProspect(id, admin)
      return NextResponse.json({ ok: true, ...result })
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  } catch (err) {
    const message = err instanceof ProposalError ? err.message : err instanceof Error ? err.message : 'Falha na operação.'
    if (!(err instanceof ProposalError)) console.error('[propostas] ação falhou', err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
