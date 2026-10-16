/** O que a tela de equipes precisa de cada equipe: membros e uso. */
export const TEAM_INCLUDE = {
  members: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  _count: { select: { stages: true, tasks: true } },
}
