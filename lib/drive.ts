import { prisma } from './prisma'
import { authorizedClient } from './gsc'
import { nomeDaPastaNova, pastaDoCliente } from './drive-core'

/**
 * Drive compartilhado de clientes: sobe arquivos na pasta de cada cliente
 * pela conexão Google da Central (a que tem o escopo do Drive liberado).
 * Só cria pasta e sobe arquivo: nunca apaga, move para a lixeira, renomeia
 * ou compartilha nada.
 */

const API = 'https://www.googleapis.com/drive/v3'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const PASTA = 'application/vnd.google-apps.folder'
const DRIVE_PADRAO = '0ANI3-An6KmTkUk9PVA'

interface Arquivo { id: string; name: string }

async function acesso(): Promise<{ token: string; driveId: string } | null> {
  const conns = await prisma.gscConnection.findMany({ where: { status: 'ATIVA' }, select: { id: true, scope: true } })
  const conn = conns.find((c) => (c.scope ?? '').split(/\s+/).includes(DRIVE_SCOPE))
  if (!conn) return null
  const { token } = await (await authorizedClient(conn.id)).getAccessToken()
  if (!token) return null
  const cfg = await prisma.systemSettings.findUnique({ where: { key: 'DRIVE_CLIENTES_ID' } }).catch(() => null)
  return { token, driveId: cfg?.value || DRIVE_PADRAO }
}

async function filhos(a: { token: string; driveId: string }, pai: string, soPastas = false): Promise<Arquivo[]> {
  const q = encodeURIComponent(`'${pai}' in parents and trashed=false${soPastas ? ` and mimeType='${PASTA}'` : ''}`)
  const r = await fetch(`${API}/files?q=${q}&fields=files(id,name)&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${a.driveId}`, { headers: { Authorization: `Bearer ${a.token}` } })
  if (!r.ok) throw new Error(`Drive respondeu ${r.status} ao listar pastas`)
  return ((await r.json()).files ?? []) as Arquivo[]
}

async function pastaFilha(a: { token: string; driveId: string }, pai: string, nome: string): Promise<string> {
  const achada = (await filhos(a, pai, true)).find((f) => f.name.trim().toUpperCase() === nome.toUpperCase())
  if (achada) return achada.id
  const r = await fetch(`${API}/files?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [pai] }),
  })
  if (!r.ok) throw new Error(`Drive respondeu ${r.status} ao criar a pasta ${nome}`)
  return (await r.json()).id as string
}

/**
 * Sobe o contrato assinado em <pasta do cliente>/02_ADM_FINANCEIRO/CONTRATOS.
 * Sem pasta do cliente, cria uma com o nome comercial. Arquivo com o mesmo
 * nome já lá não é enviado de novo.
 */
export async function subirContratoNoDrive(params: { clienteNome: string; arquivo: string; pdf: Buffer }): Promise<{ ok: boolean; caminho?: string; motivo?: string }> {
  const a = await acesso()
  if (!a) return { ok: false, motivo: 'A conexão do Google com o Drive não está ativa.' }
  const raiz = await filhos(a, a.driveId, true)
  const doCliente = pastaDoCliente(params.clienteNome, raiz)
  const clienteId = doCliente?.id ?? (await pastaFilha(a, a.driveId, nomeDaPastaNova(params.clienteNome)))
  const nomeCliente = doCliente?.name ?? nomeDaPastaNova(params.clienteNome)
  const adm = await pastaFilha(a, clienteId, '02_ADM_FINANCEIRO')
  const contratos = await pastaFilha(a, adm, 'CONTRATOS')
  const caminho = `${nomeCliente}/02_ADM_FINANCEIRO/CONTRATOS/${params.arquivo}`
  if ((await filhos(a, contratos)).some((f) => f.name === params.arquivo)) return { ok: true, caminho }

  const limite = `vexdrive${Date.now().toString(36)}`
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: params.arquivo, parents: [contratos], mimeType: 'application/pdf' })}\r\n--${limite}\r\nContent-Type: application/pdf\r\n\r\n`),
    params.pdf,
    Buffer.from(`\r\n--${limite}--`),
  ])
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': `multipart/related; boundary=${limite}` },
    body: corpo,
  })
  if (!r.ok) return { ok: false, motivo: `Drive respondeu ${r.status} ao subir o PDF` }
  return { ok: true, caminho }
}
