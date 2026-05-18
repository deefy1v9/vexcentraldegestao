import { prisma } from './prisma'

export async function logActivity(
  userId: string,
  action: string,
  module: string,
  details?: string
) {
  try {
    await prisma.activityLog.create({
      data: { userId, action, module, details },
    })
  } catch {
    // Non-blocking
  }
}
