import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { fiscalReadiness } from '@/lib/nfse'
import { Prisma } from '@prisma/client'

/** Configuração fiscal do prestador. Sem tokens — só dados tributários. */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { cfg, missing, ready } = await fiscalReadiness()
  return NextResponse.json({ config: cfg, missing, ready })
}

const STR_FIELDS = [
  'cnpj', 'razaoSocial', 'inscricaoMunicipal', 'codigoMunicipio', 'regimeEspecial',
  'naturezaOperacao', 'codigoServicoMunicipal', 'itemListaServico', 'cnae',
  'codigoTributacao', 'ibsCbs', 'descricaoPadrao', 'emitRule',
] as const
const BOOL_FIELDS = ['optanteSimples', 'incentivadorCultural', 'issRetido', 'autoEmit'] as const
const DEC_FIELDS = ['aliquotaIss', 'pis', 'cofins', 'csll', 'inss'] as const

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  for (const f of STR_FIELDS) if (has(f)) data[f] = body[f] ? String(body[f]) : null
  for (const f of BOOL_FIELDS) if (has(f)) data[f] = !!body[f]
  for (const f of DEC_FIELDS) {
    if (has(f)) {
      const v = body[f]
      if (v === null || v === '') data[f] = null
      else {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: `Valor inválido em ${f}.` }, { status: 400 })
        }
        data[f] = new Prisma.Decimal(String(n))
      }
    }
  }

  await prisma.fiscalConfig.upsert({
    where: { id: 'default' },
    update: data,
    create: { id: 'default', ...data },
  })

  await logActivity(admin.id, 'atualizou configuração fiscal', 'Financeiro', 'FiscalConfig')
  const { cfg, missing, ready } = await fiscalReadiness()
  return NextResponse.json({ config: cfg, missing, ready })
}
