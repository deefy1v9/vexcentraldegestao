import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create admin user
  const hashed = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vex.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@vex.com',
      password: hashed,
      role: 'ADMIN',
      position: 'CEO',
    },
  })

  // Create a collaborator
  const hashed2 = await bcrypt.hash('colab123', 10)
  const colab = await prisma.user.upsert({
    where: { email: 'igor@vex.com' },
    update: {},
    create: {
      name: 'Igor Silva',
      email: 'igor@vex.com',
      password: hashed2,
      role: 'COLABORADOR',
      position: 'Designer',
      salary: 3500,
    },
  })

  // Create a sample client
  const client = await prisma.client.upsert({
    where: { cnpj: '12.345.678/0001-90' },
    update: {},
    create: {
      name: 'Empresa Exemplo Ltda',
      cnpj: '12.345.678/0001-90',
      email: 'contato@exemplo.com',
      phone: '(11) 99999-9999',
      niche: 'E-commerce',
      contractStart: new Date('2025-01-01'),
      contractMonths: 12,
      contractEnd: new Date('2026-01-01'),
      monthlyValue: 3000,
      paymentDay: 10,
      status: 'ATIVO',
      services: {
        create: [
          { serviceName: 'Gestão de Redes Sociais' },
          { serviceName: 'Tráfego Pago' },
          { serviceName: 'Produção de Conteúdo' },
        ],
      },
    },
  })

  // Sample task
  await prisma.task.create({
    data: {
      title: 'Criar posts para Instagram do cliente',
      description: 'Criar 12 posts para o mês de Janeiro',
      status: 'EM_ANDAMENTO',
      priority: 'ALTA',
      clientId: client.id,
      creatorId: admin.id,
      assigneeId: colab.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  // Sample calendar event
  await prisma.calendarEvent.create({
    data: {
      title: 'Entrega de relatório mensal',
      type: 'ENTREGA',
      startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      clientId: client.id,
      assignedTo: colab.id,
    },
  })

  // Sample payment
  const now = new Date()
  await prisma.clientPayment.upsert({
    where: { id: 'seed-payment-1' },
    update: {},
    create: {
      id: 'seed-payment-1',
      clientId: client.id,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      amount: 3000,
      dueDate: new Date(now.getFullYear(), now.getMonth(), 10),
      status: 'PENDENTE',
    },
  })

  console.log('✅ Seed concluído!')
  console.log('📧 Admin: admin@vex.com / senha: admin123')
  console.log('📧 Colaborador: igor@vex.com / senha: colab123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
