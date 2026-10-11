import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.pathname, '/tecnodesk_role_permissions_test')
process.env.DOTENV_CONFIG_PATH = 'session-security-no-env-file'
process.env.NODE_ENV = 'test'; process.env.MAIL_MODE = 'fake'
process.env.JWT_SECRET = 'session-security-local-only'; process.env.ORIGIN_AUTH_ENABLED = 'false'
for (const key of ['RATE_LIMIT_AUTH_MAX','RATE_LIMIT_AUTH_WRITES_MAX','RATE_LIMIT_GLOBAL_MAX','RATE_LIMIT_SUPER_ADMIN_WRITES_MAX','RATE_LIMIT_PASSWORD_VERIFY_MAX','PASSWORD_RESET_RATE_LIMIT_MAX','RATE_LIMIT_PASSWORD_CODE_USER_MAX']) process.env[key] = '10000'

async function main() {
  const [{app},{prisma},mail] = await Promise.all([import('../src/app'),import('../src/lib/prisma'),import('../src/services/email/email.service')])
  const server = app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r))
  const address = server.address(); assert.ok(address && typeof address==='object')
  let checks=0; const failures:string[]=[]
  const probe=async(name:string,run:()=>Promise<void>)=>{try{await run();console.log(`PASS ${name}`)}catch(e){failures.push(name);console.log(`FAIL ${name}: ${e instanceof Error?e.message:'error'}`)}}
  const password='SyntheticSession7!'
  const hash=await bcrypt.hash(password,4)
  const tenant=async(label:string,platformRole:'USER'|'SUPER_ADMIN'='USER')=>{
    const business=await prisma.business.create({data:{name:`Sessions-${label}`}})
    const now=new Date(),future=new Date(Date.now()+86400000*30)
    const subscription=await prisma.subscription.create({data:{businessId:business.id,planCode:'COMPLETE',status:'ACTIVE',trialStartedAt:now,trialEndsAt:now,trialConsumedAt:now,accessExpiresAt:future,currentPeriodStart:now,currentPeriodEnd:future}})
    const user=async(role:'OWNER'|'TECHNICIAN')=>prisma.user.create({data:{businessId:business.id,name:`Synthetic ${role}`,email:`${randomUUID()}@example.test`,passwordHash:hash,role,platformRole:role==='OWNER'?platformRole:'USER',permissions:['clients.view','settings.access']}})
    const owner=await user('OWNER'),tech=await user('TECHNICIAN')
    const client=await prisma.client.create({data:{businessId:business.id,name:`Private ${label}`}})
    return {business,subscription,owner,tech,client}
  }
  const sign=(u:any,extra:object={},options:jwt.SignOptions={expiresIn:'8h'})=>jwt.sign({userId:u.id,businessId:u.businessId,tokenVersion:u.tokenVersion,role:u.role,platformRole:u.platformRole,...extra},process.env.JWT_SECRET!,options)
  const call=async(token:string|undefined,method:string,path:string,body?:object)=>{
    const r=await fetch(`http://127.0.0.1:${address.port}/api${path}`,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,redirect:'error'})
    checks++;return {status:r.status,body:await r.json() as any}
  }
  const expect=async(token:string|undefined,method:string,path:string,status:number,body?:object)=>{
    const r=await call(token,method,path,body);assert.equal(r.status,status,`${method} ${path}: expected ${status}, received ${r.status}`)
    if(status>=400) for(const key of ['passwordHash','token','permissions','business','client','repair']) assert.equal(key in r.body,false,`denial leaked ${key}`)
    return r.body
  }
  const snapshot=async()=>JSON.stringify(await Promise.all([prisma.user.findMany({orderBy:{id:'asc'}}),prisma.client.findMany({orderBy:{id:'asc'}}),prisma.cashMovement.findMany({orderBy:{id:'asc'}})]))
  try {
    const A=await tenant('A'),B=await tenant('B'),admin=await tenant('ADMIN','SUPER_ADMIN')
    await probe('temporary identity DB failure denies access without invalidating the session',async()=>{
      const original=prisma.user.findUnique
      try {
        prisma.user.findUnique=()=>{throw new Error('Synthetic temporary DB failure')}
        await expect(sign(A.owner),'GET','/auth/me',503)
      } finally {prisma.user.findUnique=original}
      await expect(sign(A.owner),'GET','/auth/me',200)
    })
    await probe('ordinary issued sessions require HS256 and bounded mandatory claims',async()=>{
      const valid=sign(A.owner);await expect(valid,'GET','/auth/me',200)
      const login=await expect(undefined,'POST','/auth/login',200,{email:A.owner.email,password})
      const decoded=jwt.decode(login.token,{complete:true})!;assert.equal(decoded.header.alg,'HS256');assert.ok(typeof decoded.payload==='object'&&decoded.payload.exp!>decoded.payload.iat!)
      const before=await snapshot()
      const claims={userId:A.owner.id,businessId:A.business.id,tokenVersion:0}
      for(const token of [sign(A.owner,{}, {algorithm:'HS512',expiresIn:'8h'}),sign(A.owner,{},{}),jwt.sign({...claims,tokenVersion:undefined},process.env.JWT_SECRET!,{expiresIn:'8h'}),sign(A.owner,{tokenVersion:-1}),sign(A.owner,{userId:[]}),sign(A.owner,{businessId:B.business.id}),sign(A.owner,{}, {expiresIn:-1}),sign(A.owner,{}, {notBefore:'1h',expiresIn:'8h'}),valid.slice(0,-3)+'bad',jwt.sign(claims,'wrong-test-secret',{expiresIn:'8h'}),jwt.sign(claims,'',{algorithm:'none',expiresIn:'8h'})]) await expect(token,'GET','/auth/me',401)
      assert.equal(await snapshot(),before)
      await expect(sign(admin.owner),'GET','/platform-admin/dashboard',200)
      await expect(sign(B.owner),'GET',`/clients/${A.client.id}`,404)
    })
    await probe('purpose tokens cannot become sessions or cross users',async()=>{
      const before=await snapshot()
      for(const purpose of ['password-change','account-deletion','password-reset']){
        const capability=sign(A.owner,{purpose})
        for(const path of ['/auth/me','/clients','/settings'])await expect(capability,'GET',path,401)
        await expect(capability,'POST','/clients',401,{name:'Not allowed'})
      }
      const foreign=sign(B.owner,{purpose:'password-change'})
      await expect(sign(A.owner),'POST','/auth/password-change/confirm',400,{verificationToken:foreign,newPassword:'NewSynthetic8!',confirmPassword:'NewSynthetic8!'})
      assert.equal(await snapshot(),before)
    })
    await probe('deactivation irrevocably retires old session and password capability',async()=>{
      const token=sign(A.tech),owner=sign(A.owner)
      const capability=sign(A.tech,{purpose:'password-change'},{expiresIn:'10m'})
      await expect(undefined,'POST','/auth/forgot-password',200,{email:A.tech.email})
      const recovery=new URL(mail.getFakeOutbox().at(-1)!.resetUrl!).searchParams.get('token')!
      await expect(owner,'PATCH',`/team/${A.tech.id}`,200,{isActive:false})
      assert.ok([401,403].includes((await call(token,'GET','/auth/me')).status))
      await expect(owner,'PATCH',`/team/${A.tech.id}`,200,{isActive:true})
      await expect(token,'GET','/auth/me',401)
      const current=await expect(undefined,'POST','/auth/login',200,{email:A.tech.email,password})
      await expect(current.token,'GET','/clients',200)
      await expect(current.token,'POST','/auth/password-change/confirm',400,{verificationToken:capability,newPassword:'NewSynthetic8!',confirmPassword:'NewSynthetic8!'})
      await expect(undefined,'POST','/auth/reset-password',400,{token:recovery,password:'NewSynthetic8!'})
    })
    await probe('effective permissions and role reread without silent session redesign',async()=>{
      const tech=await prisma.user.findUniqueOrThrow({where:{id:A.tech.id}}),token=sign(tech),owner=sign(A.owner)
      await expect(owner,'PATCH',`/team/${tech.id}`,200,{permissions:[]});await expect(token,'GET','/clients',403)
      await expect(owner,'PATCH',`/team/${tech.id}`,200,{permissions:['clients.view']});await expect(token,'GET','/clients',200)
      await expect(owner,'PATCH',`/team/${tech.id}`,200,{role:'OWNER'});await expect(token,'GET','/dashboard/overview',200)
      await expect(owner,'PATCH',`/team/${tech.id}`,200,{role:'TECHNICIAN'});await expect(token,'GET','/dashboard/overview',403)
    })
    await probe('logout-other-sessions retires every session including caller',async()=>{
      const one=sign(A.owner),two=sign(A.owner,{iat:Math.floor(Date.now()/1000)-1})
      await expect(one,'POST','/settings/logout-other-sessions',200,{})
      await expect(one,'GET','/auth/me',401);await expect(two,'GET','/auth/me',401)
      await expect(sign(B.owner),'GET','/auth/me',200)
      await expect(undefined,'POST','/auth/login',200,{email:A.owner.email,password})
    })
    await probe('password change is bounded single use and concurrent confirmation atomic',async()=>{
      const login=await expect(undefined,'POST','/auth/login',200,{email:B.tech.email,password})
      await expect(login.token,'POST','/auth/password-change/request',200,{})
      const code=mail.getFakeOutbox().at(-1)!.code!
      const verified=await expect(login.token,'POST','/auth/password-change/verify',200,{code})
      await expect(login.token,'POST','/auth/password-change/verify',400,{code})
      const body={verificationToken:verified.verificationToken,newPassword:'ChangedSynthetic8!',confirmPassword:'ChangedSynthetic8!'}
      const results=await Promise.all([call(login.token,'POST','/auth/password-change/confirm',body),call(login.token,'POST','/auth/password-change/confirm',body)])
      assert.equal(results.filter(r=>r.status===200).length,1);assert.ok(results.every(r=>[200,400,401].includes(r.status)))
      await expect(login.token,'GET','/auth/me',401)
      const next=await expect(undefined,'POST','/auth/login',200,{email:B.tech.email,password:'ChangedSynthetic8!'})
      await expect(next.token,'POST','/auth/password-change/confirm',400,body)
      const expired=sign(await prisma.user.findUniqueOrThrow({where:{id:B.tech.id}}),{purpose:'password-change'},{expiresIn:-1})
      await expect(next.token,'POST','/auth/password-change/confirm',400,{...body,verificationToken:expired})
      const missingExpiry=sign(await prisma.user.findUniqueOrThrow({where:{id:B.tech.id}}),{purpose:'password-change'},{})
      await expect(next.token,'POST','/auth/password-change/confirm',400,{...body,verificationToken:missingExpiry})
    })
    await probe('password code five-attempt limit survives simultaneous wrong guesses',async()=>{
      const user=await prisma.user.findUniqueOrThrow({where:{id:B.owner.id}}),token=sign(user),code='123456'
      const record=await prisma.passwordResetToken.create({data:{userId:user.id,purpose:'PASSWORD_CHANGE',tokenHash:createHash('sha256').update(`${user.id}:${code}`).digest('hex'),expiresAt:new Date(Date.now()+600000)}})
      const attempts=await Promise.all(Array.from({length:8},(_,i)=>call(token,'POST','/auth/password-change/verify',{code:`99999${i}`})))
      assert.ok(attempts.every(r=>r.status===400))
      const stored=await prisma.passwordResetToken.findUniqueOrThrow({where:{id:record.id}})
      assert.equal(stored.attempts,5,'concurrent failures must consume the five-guess budget');assert.ok(stored.usedAt)
      await expect(token,'POST','/auth/password-change/verify',400,{code})
    })
    await probe('recovery token is hashed bounded consumed once and invalidates sessions',async()=>{
      const old=sign(await prisma.user.findUniqueOrThrow({where:{id:B.owner.id}}))
      await expect(undefined,'POST','/auth/forgot-password',200,{email:B.owner.email})
      const raw=new URL(mail.getFakeOutbox().at(-1)!.resetUrl!).searchParams.get('token')!
      const stored=await prisma.passwordResetToken.findUniqueOrThrow({where:{tokenHash:createHash('sha256').update(raw).digest('hex')}})
      assert.notEqual(stored.tokenHash,raw);assert.ok(stored.expiresAt.getTime()-stored.createdAt.getTime()<=1800000)
      await expect(raw,'GET','/auth/me',401)
      const results=await Promise.all([call(undefined,'POST','/auth/reset-password',{token:raw,password:'ResetSynthetic8!'}),call(undefined,'POST','/auth/reset-password',{token:raw,password:'ResetSynthetic8!'})])
      assert.equal(results.filter(r=>r.status===200).length,1);assert.ok(results.every(r=>[200,400].includes(r.status)))
      await expect(old,'GET','/auth/me',401)
      await expect(undefined,'POST','/auth/reset-password',400,{token:raw,password:'AgainSynthetic8!'})
      await expect(undefined,'POST','/auth/login',200,{email:B.owner.email,password:'ResetSynthetic8!'})
      const expired='e'.repeat(64)
      await prisma.passwordResetToken.create({data:{userId:B.owner.id,tokenHash:createHash('sha256').update(expired).digest('hex'),expiresAt:new Date(Date.now()-1000)}})
      await expect(undefined,'POST','/auth/reset-password',400,{token:expired,password:'AgainSynthetic8!'})
    })
    await probe('business disable/reactivate and manual block retire previous sessions',async()=>{
      const user=await prisma.user.findUniqueOrThrow({where:{id:A.owner.id}}),token=sign(user),superToken=sign(admin.owner)
      await expect(superToken,'PATCH',`/platform-admin/businesses/${A.business.id}/status`,200,{isActive:false})
      await expect(superToken,'PATCH',`/platform-admin/businesses/${A.business.id}/status`,200,{isActive:true})
      await expect(token,'GET','/auth/me',401)
    })
    await probe('expired OWNER renewal remains bounded and TECH cannot operate',async()=>{
      const now=new Date(Date.now()-30*86400000)
      await prisma.subscription.update({where:{id:B.subscription.id},data:{accessExpiresAt:now,currentPeriodEnd:now}})
      const owner=await prisma.user.findUniqueOrThrow({where:{id:B.owner.id}}),tech=await prisma.user.findUniqueOrThrow({where:{id:B.tech.id}})
      await expect(sign(owner),'GET','/auth/me',200);await expect(sign(owner),'GET','/billing/subscription',200)
      await expect(sign(owner),'GET','/clients',403);await expect(sign(tech),'GET','/auth/me',403)
      const before=await snapshot();await expect(sign(owner),'POST','/clients',403,{name:'No operation'});assert.equal(await snapshot(),before)
    })
    await probe('in-flight authentication snapshot can complete; subsequent requests are revoked',async()=>{
      const user=await prisma.user.findUniqueOrThrow({where:{id:A.owner.id}}),token=sign(user)
      const original=prisma.user.findUnique
      let entered!:()=>void,release!:()=>void
      const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r)
      let held=false
      prisma.user.findUnique=(async(args:any)=>{
        const result=await original.call(prisma.user,args)
        if(args.where.id===user.id&&!held){held=true;entered();await gate}
        return result
      }) as typeof original
      let pending:ReturnType<typeof call>|undefined
      try {
        pending=call(token,'POST','/clients',{name:'Synthetic authorized in-flight'})
        await started
        await prisma.user.update({where:{id:user.id},data:{tokenVersion:{increment:1}}})
        release()
        assert.equal((await pending).status,201,'Current architecture authorizes a snapshot, not every write transaction')
      } finally {release();if(pending)await pending;prisma.user.findUnique=original}
      const before=await snapshot();await expect(token,'POST','/clients',401,{name:'No later operation'});assert.equal(await snapshot(),before)
    })
    console.log(`${checks} session HTTP checks; ${failures.length} failed groups`)
    assert.deepEqual(failures,[])
  } finally {await prisma.$disconnect();await new Promise<void>(r=>server.close(()=>r()))}
}
main().catch(()=>{console.error('Session security suite failed; see named groups above');process.exitCode=1})
