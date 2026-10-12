import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
const db = new URL(process.env.DATABASE_URL ?? '');
assert.equal(db.hostname, '127.0.0.1');
assert.ok(['/repair_finance_test', '/tecnodesk_role_permissions_test'].includes(db.pathname));
async function main() {
    const [{ app }, { prisma }] = await Promise.all([import('../src/app'), import('../src/lib/prisma')]);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', r));
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    try {
        const business = await prisma.business.create({ data: { name: 'Cancellation removal synthetic' } });
        const user = await prisma.user.create({ data: { businessId: business.id, name: 'Owner', email: randomUUID() + '@local.test', passwordHash: 'unused', role: 'OWNER' } });
        const now = new Date();
        await prisma.subscription.create({ data: { businessId: business.id, status: 'ACTIVE', planCode: 'COMPLETE', trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, currentPeriodEnd: new Date(+now + 86400000 * 30) } });
        const client = await prisma.client.create({ data: { businessId: business.id, name: 'Synthetic', phone: '1111111111' } });
        const repair = await prisma.repair.create({ data: { businessId: business.id, clientId: client.id, number: 1, deviceBrand: 'Test', deviceModel: 'Test', issue: 'Synthetic', total: 100000 } });
        const token = jwt.sign({ userId: user.id, businessId: business.id, role: 'OWNER', tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '1h' });
        const call = async (path: string, body?: object, method = 'POST') => { const r = await fetch('http://127.0.0.1:' + addr.port + '/api' + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() as any }; };
        const before = await prisma.repair.findUniqueOrThrow({ where: { id: repair.id } });
        for (const endpoint of ['cancel', 'cancel-preview', 'cancellation-payment'])
            assert.equal((await call('/repairs/' + repair.id + '/' + endpoint, { reviewFee: 0, amount: 1, method: 'CASH' })).status, 404, endpoint + ' route must be absent');
        assert.equal((await call('/repairs/' + repair.id + '/status', { status: 'CANCELLED' }, 'PATCH')).status, 400);
        assert.equal((await call('/repairs', { clientId: client.id, deviceBrand: 'Test', deviceModel: 'Test', issue: 'Test', status: 'CANCELLED' })).status, 400);
        assert.deepEqual(await prisma.repair.findUniqueOrThrow({ where: { id: repair.id } }), before);
        assert.equal(await prisma.payment.count({ where: { businessId: business.id } }), 0);
        assert.equal(await prisma.cashMovement.count({ where: { businessId: business.id } }), 0);
        const view = await call('/repairs/' + repair.id, undefined, 'GET');
        assert.equal(view.status, 200);
        for (const key of Object.keys(view.body))
            assert.ok(!key.startsWith('cancellation') && key !== 'cancelledAt');
        assert.equal((await call('/repairs/' + repair.id, undefined, 'DELETE')).status, 200);
        assert.equal(await prisma.repair.count({ where: { id: repair.id } }), 0);
        console.log('PASS removed endpoints 404, CANCELLED rejected without side effects, normal read/delete retained');
    }
    finally {
        server.close();
        await prisma.$disconnect();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
