import assert from 'node:assert/strict'
import type { Subscription } from '@prisma/client'
import { getAccountAccessStatus } from '../src/modules/billing/billing.service'
import { prisma } from '../src/lib/prisma'

const now = new Date('2026-08-24T15:00:00.000Z')
const base = { id:'qa',businessId:'qa',planCode:'COMPLETE',status:'ACTIVE',trialStartedAt:now,trialEndsAt:now,trialConsumedAt:now,currentPeriodStart:null,currentPeriodEnd:null,graceEndsAt:null,graceDaysOverride:5,manuallyBlockedAt:null,manualBlockReason:null,manualBlockNote:null,createdAt:now,updatedAt:now } satisfies Subscription
const at = (hours:number) => new Date(now.getTime()+hours*3_600_000)
const status = async (expiresAt:Date|null, extra:Partial<Subscription>={}) => getAccountAccessStatus({...base,accessExpiresAt:expiresAt,...extra},now)

async function run(){
  assert.equal((await status(at(30*24))).status,'ACTIVE')
  assert.equal((await status(at(7*24))).status,'EXPIRING')
  assert.equal((await status(at(24))).daysRemaining,1)
  assert.equal((await status(now)).daysRemaining,0)
  const grace=await status(at(-12));assert.equal(grace.status,'GRACE');assert.equal(grace.graceDaysRemaining,5)
  const last=await status(at(-4.5*24));assert.equal(last.status,'GRACE');assert.equal(last.graceDaysRemaining,1)
  assert.equal((await status(at(-5.5*24))).status,'BLOCKED')
  assert.equal((await status(at(30*24),{manuallyBlockedAt:now,manualBlockReason:'ADMINISTRATIVE'})).blockType,'MANUAL')
  assert.equal((await status(null)).status,'NO_EXPIRY')
  console.log('subscription lifecycle: 9 casos correctos')
}
run().finally(()=>prisma.$disconnect())
