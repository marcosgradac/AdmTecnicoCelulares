import bcrypt from 'bcryptjs'
export async function seedBackupFixtures(prisma){
 const date=new Date('2026-10-01T12:34:56.789Z'),end=new Date('2035-10-01T12:34:56.789Z')
 await prisma.plan.upsert({where:{code:'COMPLETE'},create:{code:'COMPLETE',name:'Synthetic plan',priceARS:19999,displayOrder:1,dashboardComplete:true,advancedReports:true},update:{dashboardComplete:true,advancedReports:true}})
 await prisma.billingSettings.create({data:{holderName:'Fictitious billing',alias:'synthetic.only'}})
 const shops=[]
 for(let i=0;i<2;i++){
  const business=await prisma.business.create({data:{name:`Fictitious workshop ${i}`,slug:`backup-synthetic-${i}`,hours:'09-18',logoUrl:'data:image/png;base64,aW1hZ2U='}})
  const owner=await prisma.user.create({data:{businessId:business.id,name:'Synthetic owner',email:`owner${i}@backup.example.test`,role:'OWNER',passwordHash:await bcrypt.hash('Synthetic9!Password',4),tokenVersion:4,permissions:{reports:{viewSensitive:true}}}})
  await prisma.user.create({data:{businessId:business.id,name:'Synthetic technician',email:`tech${i}@backup.example.test`,role:'TECHNICIAN',passwordHash:await bcrypt.hash('Synthetic9!Tech',4),tokenVersion:2}})
  await prisma.passwordResetToken.create({data:{userId:owner.id,tokenHash:String(i+1).repeat(64),expiresAt:end}})
  const client=await prisma.client.create({data:{businessId:business.id,name:'Fictitious customer',email:`client${i}@example.test`,notes:'Fictitious diagnosis context'}})
  const device=await prisma.device.create({data:{businessId:business.id,clientId:client.id,brand:'Test',model:'Synthetic',unlockCodeEncrypted:'fictitious-encrypted-value'}})
  const repair=await prisma.repair.create({data:{businessId:business.id,clientId:client.id,deviceId:device.id,number:1001,deviceBrand:'Test',deviceModel:'Synthetic',issue:'Fictitious issue',diagnosis:'Fictitious diagnosis',total:98765,paid:12345,status:'REPAIRING',warrantyEnabled:true,warrantyDurationDays:90,warrantyStartedAt:date,warrantyExpiresAt:end,trackingEnabled:true,trackingToken:`synthetic-backup-${i}`}})
  await prisma.repairStatusHistory.create({data:{repairId:repair.id,changedByUserId:owner.id,previousStatus:'RECEIVED',newStatus:'REPAIRING',publicMessage:'Synthetic progress',internalNote:'Fictitious internal',createdAt:date}})
  await prisma.repairPhoto.create({data:{repairId:repair.id,url:'https://example.invalid/synthetic.png',type:'diagnostic',isPublic:false}})
  const paymentCash=await prisma.cashMovement.create({data:{businessId:business.id,type:'INCOME',origin:'REPAIR',description:'Synthetic payment',amount:12345,method:'CASH',repairId:repair.id}})
  await prisma.payment.create({data:{businessId:business.id,clientId:client.id,repairId:repair.id,amount:12345,method:'CASH',cashMovementId:paymentCash.id,createdAt:date}})
  const stock=await prisma.stockItem.create({data:{businessId:business.id,name:'Synthetic part',category:'parts',quantity:7,cost:1234,salePrice:2468,compatibleModels:['Synthetic']}})
  await prisma.repairPart.create({data:{repairId:repair.id,stockItemId:stock.id,quantity:1,unitCost:1234,unitPrice:2468,itemNameSnapshot:'Synthetic part'}})
  await prisma.inventoryMovement.create({data:{businessId:business.id,stockItemId:stock.id,repairId:repair.id,createdByUserId:owner.id,type:'PURCHASE',quantity:7,unitCost:1234,totalCost:8638,previousStock:0,newStock:7}})
  const claim=await prisma.warrantyClaim.create({data:{businessId:business.id,repairId:repair.id,description:'Synthetic claim',status:'OPEN',coveredWarrantyDurationDays:90}})
  const expense=await prisma.cashMovement.create({data:{businessId:business.id,type:'EXPENSE',description:'Synthetic warranty expense',amount:5678,method:'CASH'}})
  await prisma.warrantyClaimExpense.create({data:{businessId:business.id,claimId:claim.id,cashMovementId:expense.id,idempotencyKey:`synthetic-${i}`,concept:'Synthetic expense'}})
  await prisma.commerceCategory.create({data:{businessId:business.id,name:'Synthetic accessories'}})
  const product=await prisma.commerceProduct.create({data:{businessId:business.id,name:'Synthetic product',category:'Synthetic accessories',purchaseCost:1234,salePrice:2468,currentStock:5}})
  const sale=await prisma.commerceSale.create({data:{businessId:business.id,total:4936,costOfGoodsSold:2468,profit:2468,paymentMethod:'TRANSFER',idempotencyKey:`synthetic-sale-${i}`}})
  await prisma.commerceSaleLine.create({data:{saleId:sale.id,productId:product.id,productName:'Synthetic product',quantity:2,unitCost:1234,unitPrice:2468,lineTotal:4936,lineCost:2468,lineProfit:2468}})
  await prisma.cashMovement.create({data:{businessId:business.id,type:'INCOME',origin:'COMMERCE',description:'Synthetic sale',amount:4936,commerceSaleId:sale.id,method:'TRANSFER'}})
  const subscription=await prisma.subscription.create({data:{businessId:business.id,planCode:'COMPLETE',status:'ACTIVE',trialStartedAt:date,trialEndsAt:date,trialConsumedAt:date,currentPeriodStart:date,currentPeriodEnd:end,accessExpiresAt:end}})
  await prisma.paymentSubmission.create({data:{businessId:business.id,subscriptionId:subscription.id,planCode:'COMPLETE',expectedAmount:19999,reportedAmount:19999,payerName:'Synthetic payer',transferDate:date,reviewedByUserId:owner.id,status:'APPROVED'}})
  await prisma.platformInternalNote.create({data:{businessId:business.id,authorUserId:owner.id,content:'Synthetic platform note'}})
  await prisma.subscriptionAuditLog.create({data:{businessId:business.id,actorUserId:owner.id,action:'SYNTHETIC',metadata:{fixture:true}}})
  await prisma.resaleDevice.create({data:{businessId:business.id,brand:'Test',model:'Synthetic resale',purchasePrice:12345,estimatedSalePrice:54321,status:'READY_FOR_SALE',repairExpenses:4321}})
  shops.push({businessId:business.id,ownerId:owner.id,repairId:repair.id,clientId:client.id})
 }
 return shops
}
