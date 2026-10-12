
export const includeRepair = { client: true, device: true, payments: true, statusHistory: { orderBy: { createdAt: 'desc' as const } }, warrantyClaims: { orderBy: { createdAt: 'desc' as const } } } as const
