import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  cp,
  rm,
  open,
  chmod,
  symlink,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:net";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import pg from "pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { seedBackupFixtures } from "./helpers/backup-fixtures.mjs";
import {
  startTLSCluster,
  simulatedSource,
  simulatedTLSBackup,
  nodeRun,
  snapshot,
} from "./helpers/backup-tls-cluster.mjs";
import {
  createLocalStreaming,
  restoreStreaming,
  verifyStreaming,
  catalogStreaming,
} from "../scripts/backup/stream-engine.mjs";
import { createBackup } from "../scripts/backup/engine.mjs";
import { readArchive } from "../scripts/backup/stream-format.mjs";
import {
  connectLocal,
  assertEmpty,
  childEnvironment,
} from "../scripts/backup/safety.mjs";
import { streamProcess } from "../scripts/backup/stream-process.mjs";
import { verifySourceConnection } from "../scripts/backup/source.mjs";
import { readPrivateFile } from "../scripts/backup/private-file.mjs";
import { runTool } from "../scripts/backup/safety.mjs";
const backend = resolve(fileURLToPath(new URL("..", import.meta.url))),
  bin =
    process.env.PG_BIN ||
    (process.platform === "win32"
      ? join(backend, ".security9-tools/pgsql/bin")
      : "/usr/lib/postgresql/17/bin");
const cluster = await startTLSCluster(bin),
  key = randomBytes(32),
  output = join(cluster.root, "backup-output");
let prisma,
  checks = 0;
const pass = (s) => {
    checks++;
    console.log("PASS " + s);
  },
  url = (db) => `postgresql://postgres@127.0.0.1:${cluster.port}/${db}`;
const env = {
  ...childEnvironment(),
  NODE_ENV: "test",
  DOTENV_CONFIG_PATH: join(cluster.root, "absent.env"),
};
async function newTarget(prefix) {
  const name = "tecnodesk_backup_test_" + prefix + cluster.suffix;
  await cluster.maintenance.query(`CREATE DATABASE "${name}"`);
  return cluster.local(name);
}
async function worker(operation, options) {
  const f = join(cluster.root, "worker-" + operation + ".json");
  await writeFile(f, JSON.stringify(options), { mode: 0o600 });
  return JSON.parse(
    await nodeRun(
      [
        "--max-old-space-size=32",
        "tests/backup-stream-worker.mjs",
        operation,
        f,
      ],
      env,
      backend,
    ),
  );
}
async function payloadDigest(client) {
  const hash = createHash("sha256");
  let count = 0,
    size = 0;
  const ids = (
    await client.query("SELECT id FROM public.security9b_payload ORDER BY id")
  ).rows;
  for (const { id } of ids) {
    const b = (
      await client.query(
        "SELECT bytes FROM public.security9b_payload WHERE id=$1",
        [id],
      )
    ).rows[0].bytes;
    hash.update(b);
    size += b.length;
    count++;
  }
  return { count, size, sha: hash.digest("hex") };
}
try {
  await mkdir(output, { mode: 0o700 });
  const keyFile = join(cluster.root, "fictitious.backup-key");
  await writeFile(keyFile, key, { mode: 0o600 });
  const privateConfig = join(cluster.root, "private-config.json");
  await writeFile(privateConfig, '{"synthetic":true}', { mode: 0o600 });
  assert.equal(
    (await readPrivateFile(privateConfig, { outsideGit: true })).toString(),
    '{"synthetic":true}',
  );
  const pretendRepo = join(cluster.root, "pretend-git");
  await mkdir(pretendRepo);
  await mkdir(join(pretendRepo, ".git"));
  const gitConfig = join(pretendRepo, "config.json");
  await writeFile(gitConfig, "{}", { mode: 0o600 });
  await assert.rejects(() => readPrivateFile(gitConfig, { outsideGit: true }));
  const link = join(cluster.root, "linked-config");
  await symlink(
    pretendRepo,
    link,
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(() => readPrivateFile(join(link, "config.json")));
  const sharedConfig = join(cluster.root, "shared-config.json");
  await writeFile(sharedConfig, "{}", { mode: 0o600 });
  if (process.platform === "win32")
    await runTool(join(process.env.SystemRoot, "System32/icacls.exe"), [
      sharedConfig,
      "/grant",
      "*S-1-1-0:R",
    ]);
  else await chmod(sharedConfig, 0o644);
  await assert.rejects(() => readPrivateFile(sharedConfig));
  pass(
    "private files allowed; Git ancestry, shared permissions and symlink ancestors rejected",
  );
  // The only source is the owned, loopback PostgreSQL TLS cluster. Not a Supabase connection.
  await nodeRun(
    [
      join(backend, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      join(backend, "prisma/schema.prisma"),
    ],
    { ...env, DATABASE_URL: url("postgres") },
    cluster.root,
  );
  prisma = new PrismaClient({ datasources: { db: { url: url("postgres") } } });
  await seedBackupFixtures(prisma);
  await cluster.maintenance.query(
    "CREATE SEQUENCE public.security9b_sequence START WITH 37",
  );
  await cluster.maintenance.query(
    "SELECT nextval('public.security9b_sequence')",
  );
  await cluster.maintenance.query(
    "CREATE ROLE backup_reader LOGIN PASSWORD 'synthetic-only-password'",
  );
  await cluster.maintenance.query("CREATE ROLE security9b_denied LOGIN");
  await cluster.maintenance.query(
    "GRANT USAGE ON SCHEMA public TO backup_reader",
  );
  await cluster.maintenance.query(
    "GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader",
  );
  await cluster.maintenance.query(
    "GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_reader",
  );
  const before = await snapshot(cluster.maintenance);
  for (const model of Prisma.dmmf.datamodel.models)
    assert.ok(before.rows[model.dbName || model.name]?.length > 0);
  assert.equal(Prisma.dmmf.datamodel.models.length, 26);
  pass(
    "owned TLS PostgreSQL 17 and all 26 real models, two workshops, complete migrations",
  );
  await simulatedSource(cluster);
  await simulatedSource(cluster, { mode: "session" });
  pass(
    "strict TLS source identity and read-only session, direct/session routing simulation",
  );
  for (const options of [{ wrongName: true }, { badCA: true }])
    await assert.rejects(() => simulatedSource(cluster, options));
  pass("wrong certificate trust and wrong TLS hostname rejected");
  const noTLS = createServer((socket) =>
    socket.once("data", () => socket.end("N")),
  );
  await new Promise((r) => noTLS.listen(0, "127.0.0.1", r));
  try {
    await assert.rejects(() =>
      verifySourceConnection(
        {
          host: "db.abcdefghijklmnopqrst.supabase.co",
          port: noTLS.address().port,
          database: "postgres",
          user: "backup_reader",
          mode: "direct",
        },
        { address: "127.0.0.1", password: "synthetic-only-password", ca: "" },
      ),
    );
  } finally {
    await new Promise((r) => noTLS.close(r));
  }
  pass("server refusing TLS rejected without plaintext fallback");
  await assert.rejects(() =>
    simulatedTLSBackup({ cluster, key, bin, output, denied: true }),
  );
  assert.deepEqual(await readdir(output), []);
  pass("insufficient source privileges cannot publish backup");
  const saved = await simulatedTLSBackup({ cluster, key, bin, output });
  await verifyStreaming({ bundle: saved.bundle, key, bin });
  pass(
    "simulated remote TLS dump, V2 encryption, manifest/EOF and PostgreSQL structure",
  );
  const target = await newTarget("r"),
    restored = await restoreStreaming({
      config: target,
      key,
      bin,
      bundle: saved.bundle,
    });
  const c = (await connectLocal(target)).client;
  assert.deepEqual(await snapshot(c), before);
  assert.equal(
    Number(
      (await c.query("SELECT nextval('public.security9b_sequence') value"))
        .rows[0].value,
    ),
    38,
  );
  await assert.rejects(() =>
    c.query(
      "INSERT INTO \"Client\" (id,\"businessId\",name,\"updatedAt\") VALUES ('bad','missing','fictitious',now())",
    ),
  );
  await c.end();
  pass(
    "exact rows, IDs, dates, money, relationships, constraints, indexes, migrations and sequence continuation",
  );
  await nodeRun(
    ["--import", "tsx", "tests/backup-restored-api.ts"],
    {
      ...env,
      DATABASE_URL: url(target.database),
      BACKUP_DISPOSABLE: "true",
      JWT_SECRET: "security9-fictitious-local-jwt",
      CLIENT_IP_MODE: "baseline",
      ORIGIN_AUTH_ENABLED: "false",
      RESEND_API_KEY: "",
      MAIL_MODE: "console",
    },
    backend,
  );
  pass(
    "restored real backend health, synthetic login, clients/repairs/cash and tenant isolation",
  );
  await assert.rejects(
    () => restoreStreaming({ config: target, key, bin, bundle: saved.bundle }),
    /not empty/,
  );
  pass("nonempty restore still rejected");
  const localSource = await newTarget("v");
  await restoreStreaming({
    config: localSource,
    key,
    bin,
    bundle: saved.bundle,
  });
  const legacy = await createBackup({ config: localSource, key, bin, output });
  assert.equal(
    (await verifyStreaming({ bundle: legacy.bundle, key, bin })).authenticated,
    true,
  );
  const legacyTarget = await newTarget("l");
  await restoreStreaming({
    config: legacyTarget,
    key,
    bin,
    bundle: legacy.bundle,
  });
  const lc = (await connectLocal(legacyTarget)).client;
  assert.deepEqual(await snapshot(lc), before);
  await lc.end();
  pass("9A TDBACK01 backup verified and restored through V2 interface");
  const localV2 = await createLocalStreaming({
    config: localSource,
    key,
    bin,
    output,
  });
  await verifyStreaming({ bundle: localV2.bundle, key, bin });
  pass("new local streaming path preserves 9A source/destination guards");
  const cliConfig = join(cluster.root, "cli-local-config.json");
  await writeFile(cliConfig, JSON.stringify(localSource), { mode: 0o600 });
  const cliCreated = JSON.parse(
    await nodeRun(
      [
        "scripts/backup/stream-cli.mjs",
        "create-local",
        "--config",
        cliConfig,
        "--key-file",
        keyFile,
        "--bin",
        bin,
        "--output",
        output,
      ],
      env,
      backend,
    ),
  );
  assert.ok(cliCreated.id.startsWith("backup-"));
  assert.equal(
    JSON.parse(
      await nodeRun(
        [
          "scripts/backup/stream-cli.mjs",
          "verify",
          "--bundle",
          join(output, cliCreated.id),
          "--key-file",
          keyFile,
          "--bin",
          bin,
        ],
        env,
        backend,
      ),
    ).authenticated,
    true,
  );
  pass(
    "streaming CLI creates and authenticates a private fictitious backup without secret output",
  );
  // Fail publication through the actual engine, never through a production bypass flag.
  const originalOpen = fsPromises.open;
  for (const kind of ["ENOSPC", "EACCES", "publish-abort"]) {
    const existing = (await readdir(output)).sort(),
      controller = new AbortController();
    try {
      fsPromises.open = async (...args) => {
        if (
          String(args[0]).startsWith(output) &&
          String(args[0]).endsWith("manifest.json") &&
          String(args[1]) === "wx"
        ) {
          if (kind === "EACCES")
            throw Object.assign(Error("Fictitious write denial"), {
              code: kind,
            });
          const fd = await originalOpen(...args);
          if (kind === "ENOSPC")
            fd.writeFile = async () => {
              throw Object.assign(Error("Fictitious full disk"), {
                code: kind,
              });
            };
          else {
            const sync = fd.sync.bind(fd);
            fd.sync = async () => {
              await sync();
              controller.abort();
            };
          }
          return fd;
        }
        return originalOpen(...args);
      };
      syncBuiltinESMExports();
      await assert.rejects(() =>
        createLocalStreaming({
          config: localSource,
          key,
          bin,
          output,
          signal: controller.signal,
        }),
      );
    } finally {
      fsPromises.open = originalOpen;
      syncBuiltinESMExports();
    }
    assert.deepEqual((await readdir(output)).sort(), existing);
  }
  pass(
    "engine ENOSPC/EACCES/publication cancellation removes only its incomplete bundle",
  );
  // Delay COPY only in an owned fictitious source, to prove the final commit is gated.
  const slow = (await connectLocal(localSource)).client;
  await slow.query(
    "CREATE FUNCTION public.security9b_restore_delay(text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(2); RETURN true; END $$",
  );
  await slow.query(
    'ALTER TABLE "Client" ADD CONSTRAINT security9b_restore_delay_check CHECK (public.security9b_restore_delay(id))',
  );
  try {
    const delayed = await createLocalStreaming({
        config: localSource,
        key,
        bin,
        output,
      }),
      bytes = await readFile(join(delayed.bundle, "archive.tdbackup"));
    let footer = 12 + bytes.readUInt32BE(8);
    while (bytes[footer] === 0)
      footer += 9 + bytes.readUInt32BE(footer + 5) + 16;
    async function waitForCopy(db) {
      for (let i = 0; i < 500; i++) {
        const rows = (
          await cluster.maintenance.query(
            "SELECT pid FROM pg_stat_activity WHERE datname=$1 AND application_name='tecnodesk-backup-local-tool' AND wait_event='PgSleep'",
            [db],
          )
        ).rows;
        if (rows.length) return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw Error("Owned restore did not reach delayed COPY");
    }
    const finalTarget = await newTarget("z");
    let finalFault = false;
    try {
      fsPromises.open = async (...args) => {
        const fd = await originalOpen(...args);
        if (String(args[0]) === join(delayed.bundle, "archive.tdbackup")) {
          const originalRead = fd.read.bind(fd);
          let passes = 0;
          fd.read = async (...a) => {
            if (a[3] === 0) passes++;
            if (passes >= 3 && a[3] === footer) {
              await waitForCopy(finalTarget.database);
              finalFault = true;
              throw Error("Fictitious final footer read failure");
            }
            return originalRead(...a);
          };
        }
        return fd;
      };
      syncBuiltinESMExports();
      await assert.rejects(() =>
        restoreStreaming({
          config: finalTarget,
          key,
          bin,
          bundle: delayed.bundle,
        }),
      );
    } finally {
      fsPromises.open = originalOpen;
      syncBuiltinESMExports();
    }
    assert.equal(finalFault, true);
    const finalClient = (await connectLocal(finalTarget)).client;
    await assertEmpty(finalClient);
    await finalClient.end();
    pass(
      "failure after last data block and active COPY rolls back all SQL before final EOF",
    );
    const cancelTarget = await newTarget("x"),
      controller = new AbortController(),
      operation = restoreStreaming({
        config: cancelTarget,
        key,
        bin,
        bundle: delayed.bundle,
        signal: controller.signal,
      }).then(
        () => true,
        () => false,
      );
    try {
      await waitForCopy(cancelTarget.database);
    } finally {
      controller.abort();
    }
    assert.equal(await operation, false);
    const cancelClient = (await connectLocal(cancelTarget)).client;
    await assertEmpty(cancelClient);
    await cancelClient.end();
    pass(
      "actual in-flight streamed SQL cancellation leaves verified empty destination",
    );
  } finally {
    await slow.query(
      'ALTER TABLE "Client" DROP CONSTRAINT security9b_restore_delay_check',
    );
    await slow.query("DROP FUNCTION public.security9b_restore_delay(text)");
    await slow.end();
  }
  const copyRoot = join(cluster.root, "second-private-copy");
  await mkdir(copyRoot, { mode: 0o700 });
  const copy = join(copyRoot, saved.id);
  await cp(saved.bundle, copy, { recursive: true });
  const copiedTarget = await newTarget("p");
  await restoreStreaming({ config: copiedTarget, key, bin, bundle: copy });
  const copied = (await connectLocal(copiedTarget)).client;
  assert.deepEqual(await snapshot(copied), before);
  await copied.end();
  pass("independent encrypted second copy actually restored and compared");
  for (const task of [
    () => verifyStreaming({ bundle: saved.bundle, key: randomBytes(32), bin }),
    () =>
      restoreStreaming({
        config: awaitableRemote(),
        key,
        bin,
        bundle: saved.bundle,
      }),
  ])
    await assert.rejects(task);
  pass("wrong key and all remote restoration rejected");
  function awaitableRemote() {
    return { ...target, host: "db.zxdrxobjoalzqukzzmko.supabase.co" };
  }
  const corrupt = join(cluster.root, "corrupt");
  await cp(saved.bundle, corrupt, { recursive: true });
  const f = await open(join(corrupt, "archive.tdbackup"), "r+");
  const byte = Buffer.alloc(1);
  await f.read(byte, 0, 1, 600);
  byte[0] ^= 1;
  await f.write(byte, 0, 1, 600);
  await f.close();
  const failTarget = await newTarget("f");
  await assert.rejects(() =>
    restoreStreaming({ config: failTarget, key, bin, bundle: corrupt }),
  );
  const fc = (await connectLocal(failTarget)).client;
  await assertEmpty(fc);
  await fc.end();
  pass("corruption rejected before creating even one destination object");
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(() =>
    simulatedTLSBackup({ cluster, key, bin, output, signal: aborted.signal }),
  );
  await assert.rejects(() =>
    simulatedTLSBackup({ cluster, key, bin, output, maxBytes: 1 }),
  );
  pass("pre-cancellation and size limits do not publish invalid bundles");
  await assert.rejects(() =>
    streamProcess(process.execPath, ["-e", "setTimeout(()=>{},10000)"], {
      timeoutMs: 30,
    }),
  );
  pass("stalled child timeout is bounded and process closes");
  // Hold a table lock to interrupt the actual TLS pg_dump, not a mocked stream.
  await cluster.maintenance.query("BEGIN");
  await cluster.maintenance.query(
    'LOCK TABLE "Client" IN ACCESS EXCLUSIVE MODE',
  );
  try {
    const controller = new AbortController(),
      op = simulatedTLSBackup({
        cluster,
        key,
        bin,
        output,
        signal: controller.signal,
      }).then(
        () => true,
        () => false,
      );
    let reached = false;
    for (let i = 0; i < 200; i++) {
      await cluster.maintenance.query("SELECT pg_stat_clear_snapshot()");
      const rows = (
        await cluster.maintenance.query(
          "SELECT pid FROM pg_stat_activity WHERE application_name='tecnodesk-backup-authorized-export' AND wait_event_type='Lock'",
        )
      ).rows;
      if (rows.length) {
        reached = true;
        await cluster.maintenance.query("SELECT pg_terminate_backend($1)", [
          rows[0].pid,
        ]);
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    if (!reached) controller.abort();
    assert.ok(reached);
    assert.equal(await op, false);
  } finally {
    await cluster.maintenance.query("ROLLBACK");
  }
  pass("actual TLS dump interruption leaves no completed bundle");
  // Read failures, ENOSPC and cancellation after several authenticated frames.
  for (const kind of ["ENOSPC", "read-error", "cancel"]) {
    const broken = join(cluster.root, "fault-" + kind),
      fd = await open(broken, "wx+", 0o600);
    const controller = new AbortController();
    let n = 0;
    const sink = {
      write: async (...a) => {
        if (kind === "ENOSPC" && n++ > 2)
          throw Object.assign(Error("fictitious failure"), { code: "ENOSPC" });
        return fd.write(...a);
      },
    };
    const source = (async function* () {
      for (let i = 0; i < 5; i++) {
        if (i === 2 && kind === "read-error")
          throw Error("Fictitious input failure");
        if (i === 2 && kind === "cancel") controller.abort();
        yield randomBytes(1024 * 1024);
      }
    })();
    const { encryptArchive } = await import(
      "../scripts/backup/stream-format.mjs"
    );
    await assert.rejects(() =>
      encryptArchive(
        source,
        key,
        {
          id: "backup-fault",
          createdAt: new Date().toISOString(),
          postgresVersion: "17.11",
        },
        sink,
        { signal: controller.signal },
      ),
    );
    await fd.close();
    await rm(broken);
  }
  pass(
    "mid-stream read/write/ENOSPC/cancel failures controlled without plaintext files",
  );
  assert.equal(
    (await catalogStreaming({ output, key, bin })).deleteAutomatically,
    false,
  );
  pass("authenticated mixed V1/V2 catalogue retains dry-run only");
  assert.deepEqual(await snapshot(cluster.maintenance), before);
  pass("source rows unchanged through all failure trials");
  // Incompressible bytes ensure the actual custom archive exceeds the old 128 MiB ceiling.
  await cluster.maintenance.query(
    "CREATE TABLE public.security9b_payload (id integer PRIMARY KEY,bytes bytea NOT NULL)",
  );
  for (let i = 0; i < 144; i++)
    await cluster.maintenance.query(
      "INSERT INTO public.security9b_payload VALUES ($1,$2)",
      [i, randomBytes(1024 * 1024)],
    );
  await cluster.maintenance.query(
    "GRANT SELECT ON public.security9b_payload TO backup_reader",
  );
  const payloadBefore = await payloadDigest(cluster.maintenance);
  const clusterData = {
    root: cluster.root,
    port: cluster.port,
    cert: cluster.cert,
  };
  const big = await worker("create", {
    cluster: clusterData,
    keyFile,
    bin,
    output,
  });
  assert.ok(big.result.manifest.plainSize > 128 * 1024 * 1024);
  assert.ok(big.peakExternal < 48 * 1024 * 1024);
  assert.ok(big.peakRSS - big.baselineRSS < 96 * 1024 * 1024);
  pass(
    "actual custom archive >128 MiB with measured bounded RSS/external memory",
  );
  const bigTarget = await newTarget("b"),
    bigRestore = await worker("restore", {
      config: bigTarget,
      keyFile,
      bin,
      bundle: big.result.bundle,
    });
  console.log(
    JSON.stringify({
      benchmark: "synthetic-stream-memory",
      plainBytes: big.result.manifest.plainSize,
      backupPeakRSS: big.peakRSS,
      backupPeakExternal: big.peakExternal,
      restorePeakRSS: bigRestore.peakRSS,
      restoreBaselineRSS: bigRestore.baselineRSS,
      restorePeakExternal: bigRestore.peakExternal,
    }),
  );
  assert.ok(
    bigRestore.peakExternal < 48 * 1024 * 1024,
    JSON.stringify(bigRestore),
  );
  assert.ok(
    bigRestore.peakRSS - bigRestore.baselineRSS < 96 * 1024 * 1024,
    JSON.stringify(bigRestore),
  );
  const bc = (await connectLocal(bigTarget)).client;
  assert.deepEqual(await payloadDigest(bc), payloadBefore);
  const bigSnapshot = await snapshot(bc);
  assert.deepEqual(bigSnapshot, await snapshot(cluster.maintenance));
  assert.deepEqual(bigSnapshot.rows, before.rows);
  await bc.end();
  pass(
    "large streamed restore validates full payload digest, every row, constraints and migrations",
  );
  console.log(
    JSON.stringify({
      checks,
      models: 26,
      smallBackupBytes: saved.manifest.encryptedSize,
      smallRestoreMs: restored.restoreMs,
      bigPlainBytes: big.result.manifest.plainSize,
      bigEncryptedBytes: big.result.manifest.encryptedSize,
      backupMs: big.result.backupMs,
      restoreMs: bigRestore.result.restoreMs,
      backupBaselineRSS: big.baselineRSS,
      backupPeakRSS: big.peakRSS,
      backupPeakExternal: big.peakExternal,
      restoreBaselineRSS: bigRestore.baselineRSS,
      restorePeakRSS: bigRestore.peakRSS,
      restorePeakExternal: bigRestore.peakExternal,
      productionAccess: false,
    }),
  );
} finally {
  key.fill(0);
  await prisma?.$disconnect();
  await cluster.cleanup();
}
