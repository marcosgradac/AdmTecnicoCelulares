// Loopback only, invented keys/IPs, no Prisma and no production services.
import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import express from 'express'
import { request } from 'node:http'
import { createClientIpMiddleware, readClientIpConfig, clientIp, clientIpKey, clientRiskKey, type ClientIpConfig } from '../src/middlewares/client-ip'
const cf = { mode: 'cf' as const }
async function fixture(t: TestContext, mode: ClientIpConfig = cf, now?: () => number) {
 const app = express(); app.set('trust proxy', mode.mode === 'cf' ? false : 1)
 app.use(createClientIpMiddleware(mode, now)); let hits = 0
 app.get('/probe', (req, res) => { hits++; res.json({ ip: clientIp(req), key: clientIpKey(req), risk: clientRiskKey(req), native: req.ip }) })
 const server = app.listen(0, '127.0.0.1'); await new Promise<void>(done => server.once('listening', done))
 t.after(() => new Promise<void>(done => server.close(() => done())))
 const address = server.address() as { port: number }
 const probe = (value?: string | string[], extra: Record<string, string> = {}) => new Promise<{ status: number, body: any, retryAfter: string | undefined }>((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: address.port, path: '/probe', headers: { ...(value === undefined ? {} : { 'CF-Connecting-IP': value }), ...extra } }, res => {
   let text = ''; res.on('data', chunk => { text += chunk }); res.on('end', () => resolve({status: res.statusCode!, body: JSON.parse(text), retryAfter: res.headers['retry-after']}))
  }); req.on('error', reject); req.end()
 })
 return { probe, hits: () => hits }
}
test('baseline is default; cf needs explicit Render public ingress acknowledgment', () => {
 assert.equal(readClientIpConfig({}).mode, 'baseline')
 assert.throws(() => readClientIpConfig({ CLIENT_IP_MODE: 'true' }))
 assert.throws(() => readClientIpConfig({ CLIENT_IP_MODE: 'cf' }))
 assert.throws(() => readClientIpConfig({ CLIENT_IP_MODE: 'cf', CLIENT_IP_CF_TRUST_ACK: 'true' }))
 assert.equal(readClientIpConfig({ CLIENT_IP_MODE: 'cf', CLIENT_IP_CF_TRUST_ACK: 'render-public-web-service' }).mode, 'cf')
})
test('baseline preserves Express identity and ignores CF', async t => {
 const { probe } = await fixture(t, { mode: 'baseline' })
 const result = await probe('192.0.2.99', { 'X-Forwarded-For': '198.51.100.1' })
 assert.equal(result.body.ip, '198.51.100.1'); assert.equal(result.body.ip, result.body.native)
})
test('IPv4 clients differ, NAT shares keys, native Express IP stays separate', async t => {
 const { probe } = await fixture(t)
 const a = await probe('192.0.2.1'), b = await probe('192.0.2.2'), nat = await probe('192.0.2.1')
 assert.equal(a.status, 200); assert.notEqual(a.body.key, b.body.key); assert.equal(a.body.key, nat.body.key)
 assert.notEqual(a.body.ip, a.body.native); assert.equal(a.body.risk, a.body.key)
})
test('IPv6 /56 also groups abuse identity; mapped IPv4 spellings cannot rotate keys', async t => {
 const { probe } = await fixture(t)
 const a = await probe('2001:db8:1200:1::1'), b = await probe('2001:db8:1200:2::2'), c = await probe('2001:db8:1300::1')
 assert.equal(a.body.key, b.body.key); assert.equal(a.body.risk, b.body.risk); assert.notEqual(a.body.key, c.body.key)
 const ipv4 = await probe('192.0.2.8')
 for (const mapped of ['::ffff:192.0.2.8', '::FFFF:C000:0208']) assert.equal((await probe(mapped)).body.key, ipv4.body.key)
})
test('missing, invalid, lists, zones and duplicates fail before protected handler; never XFF fallback', async t => {
 const { probe, hits } = await fixture(t)
 for (const value of [undefined, '', 'bad', '192.0.2.1,192.0.2.2', '192.0.2.1:80', '[2001:db8::1]', 'fe80::1%eth0', ['192.0.2.1','192.0.2.1']]) {
  const result = await probe(value, { 'X-Forwarded-For': '198.51.100.1' }); assert.equal(result.status, 400); assert.deepEqual(result.body, {success:false,message:'Solicitud inválida.'})
 }
 assert.equal(hits(), 0)
})
test('forged XFF cannot change CF identity; valid CF is forgeable without external sanitation', async t => {
 const { probe } = await fixture(t)
 const a = await probe('192.0.2.1', { 'X-Forwarded-For': '198.51.100.1' })
 const b = await probe('192.0.2.1', { 'X-Forwarded-For': '198.51.100.2', 'X-Real-IP': '198.51.100.3' })
 assert.equal(a.body.key,b.body.key)
 assert.notEqual(a.body.key,(await probe('192.0.2.2')).body.key)
})

test('invalid CF budget cannot be rotated by headers; valid clients and NAT are not blocked; monotonic window resets', async t => {
 let clock = 0
 const { probe, hits } = await fixture(t, { mode: 'cf', invalidLimit: 2 }, () => clock)
 assert.equal((await probe(undefined, { 'X-Forwarded-For': '192.0.2.1' })).status, 400)
 assert.equal((await probe('bad', { 'X-Forwarded-For': '192.0.2.2' })).status, 400)
 for (const value of [undefined, 'bad-again', '192.0.2.1, 192.0.2.2']) {
  const blocked = await probe(value, { 'X-Forwarded-For': '192.0.2.99', 'X-Real-IP': '198.51.100.99' })
  assert.equal(blocked.status, 429)
  assert.equal(blocked.retryAfter, '60')
  assert.deepEqual(blocked.body, { success:false, message:'Solicitud inválida.' })
 }
 assert.equal(hits(), 0)
 assert.equal((await probe('192.0.2.1')).status, 200)
 assert.equal((await probe('192.0.2.1')).status, 200)
 assert.equal((await probe('192.0.2.2')).status, 200)
 clock = 59_500
 assert.equal((await probe()).retryAfter, '1')
 clock = 60_000
 assert.equal((await probe()).status, 400)
 assert.equal(hits(), 3)
})
test('invalid budget configuration fails closed in cf; baseline ignores the unused option', () => {
 const valid = { CLIENT_IP_MODE: 'cf', CLIENT_IP_CF_TRUST_ACK: 'render-public-web-service' }
 assert.equal(readClientIpConfig(valid).invalidLimit, 60)
 for (const value of ['0', '-1', '1.5', '601', 'NaN', '']) assert.throws(() => readClientIpConfig({ ...valid, CLIENT_IP_INVALID_MAX: value }))
 assert.equal(readClientIpConfig({ CLIENT_IP_INVALID_MAX: 'bad' }).mode, 'baseline')
})