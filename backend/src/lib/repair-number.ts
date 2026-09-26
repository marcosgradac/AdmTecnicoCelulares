import type { Prisma } from '@prisma/client'

// Call inside the same transaction that inserts the repair. UPDATE locks the
// business row, so concurrent allocations see the last committed counter.
export async function allocateRepairNumber(tx: Prisma.TransactionClient, businessId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ lastRepairNumber: number }>>`
    UPDATE "Business"
    SET "lastRepairNumber" = GREATEST(
      "lastRepairNumber",
      COALESCE((SELECT MAX("number") FROM "Repair" WHERE "businessId" = ${businessId}), 1000)
    ) + 1
    WHERE "id" = ${businessId}
    RETURNING "lastRepairNumber"
  `
  // MAX only reconciles imported records; deletion never lowers the counter.
  if (!rows[0]) throw new Error('El negocio no existe')
  return rows[0].lastRepairNumber
}
