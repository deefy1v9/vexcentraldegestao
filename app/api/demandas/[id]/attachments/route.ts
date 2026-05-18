import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

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
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
