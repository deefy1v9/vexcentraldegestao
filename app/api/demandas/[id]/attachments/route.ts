import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

// Os anexos ficam em public/uploads e são servidos estaticamente pelo Next.
// Um .html ou .svg enviado por um usuário seria renderizado no MESMO domínio
// da aplicação — ou seja, XSS armazenado com acesso à sessão de quem abrisse
// o arquivo. Bloqueia só o que o navegador executa; os formatos de trabalho
// da agência (imagem, vídeo, PDF, zip, psd, ai...) continuam liberados.
const BLOCKED_EXTENSIONS = [
  '.html', '.htm', '.xhtml', '.shtml', '.xml', '.svg', '.js', '.mjs', '.cjs',
]

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Arquivo maior que o limite de ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    )
  }

  const lowerName = file.name.toLowerCase()
  if (BLOCKED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return NextResponse.json(
      { error: 'Tipo de arquivo não permitido por segurança' },
      { status: 415 },
    )
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const uploadDir = join(process.cwd(), 'public', 'uploads', 'tasks', id)
  await mkdir(uploadDir, { recursive: true })

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const filePath = join(uploadDir, safeName)
  await writeFile(filePath, buffer)

  const fileUrl = `/uploads/tasks/${id}/${safeName}`

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: id,
      fileName: file.name,
      fileUrl,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
    },
  })

  return NextResponse.json(attachment)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const { attachmentId } = await req.json()

  const attachment = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, taskId: id },
  })
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.taskAttachment.delete({ where: { id: attachmentId } })

  try {
    const { unlink } = await import('fs/promises')
    await unlink(join(process.cwd(), 'public', attachment.fileUrl))
  } catch {}

  return NextResponse.json({ ok: true })
}
