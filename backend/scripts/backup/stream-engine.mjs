import { mkdir, open, rm, readdir, lstat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  validateLocalConfig,
  connectLocal,
  assertEmpty,
  assertPrivatePath,
  assertTools,
  childEnvironment,
  toolPath,
} from "./safety.mjs";
import { privateFile, readPrivateFile } from "./private-file.mjs";
import {
  encryptArchive,
  readArchive,
  validateLimits,
} from "./stream-format.mjs";
import { prepareSource, validateSource } from "./source.mjs";
import { streamProcess } from "./stream-process.mjs";
import { verifyBackup, restoreBackup } from "./engine.mjs";
import { retentionPlan } from "./catalog.mjs";
const same = (a, b) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs;
async function openBundle(bundle) {
  await assertPrivatePath(bundle);
  const manifest = JSON.parse(
    (
      await readPrivateFile(join(bundle, "manifest.json"), { limit: 16384 })
    ).toString(),
  );
  if (manifest.metadata?.version === 1) return { manifest, legacy: true };
  const file = await privateFile(join(bundle, "archive.tdbackup"), {
    limit: 64 * 1024 ** 3 + 4 * 1024 * 1024,
  });
  return { manifest, file, stamp: await file.stat() };
}
async function checkUnchanged(file, stamp) {
  if (!same(stamp, await file.stat()))
    throw Error("Backup changed during verification");
}
async function authenticate(file, key, manifest, signal) {
  let count = 0,
    magic = Buffer.alloc(0);
  for await (const b of readArchive(file, key, manifest, { signal })) {
    if (magic.length < 5)
      magic = Buffer.concat([magic, b.subarray(0, 5 - magic.length)]);
    count += b.length;
    b.fill(0);
  }
  if (count < 32 || magic.toString() !== "PGDMP")
    throw Error("Invalid PostgreSQL custom archive");
}
async function structure(file, key, manifest, bin, options) {
  await streamProcess(toolPath(bin, "pg_restore"), ["--list"], {
    input: readArchive(file, key, manifest, options),
    allowEarlyInputClose: true,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    consume: async (stdout) => {
      let n = 0;
      for await (const b of stdout) {
        n += b.length;
        if (n > 4 * 1024 * 1024) throw Error("Archive catalogue too large");
      }
    },
  });
}
async function createPrepared({
  prepared,
  key,
  bin,
  output,
  codeCommit = null,
  signal,
  ...options
}) {
  const limits = validateLimits(options);
  await assertTools(bin);
  await assertPrivatePath(output);
  const root = resolve(output),
    id =
      "backup-" +
      new Date().toISOString().replace(/[^0-9TZ]/g, "") +
      "-" +
      randomUUID(),
    bundle = join(root, id);
  let owned = false,
    file;
  const start = performance.now(),
    controller = new AbortController(),
    abort = () => controller.abort(),
    timer = setTimeout(abort, limits.timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    await mkdir(bundle, { mode: 0o700 });
    owned = true;
    await assertPrivatePath(bundle);
    file = await open(join(bundle, "archive.tdbackup"), "wx+", 0o600);
    const manifest = await streamProcess(
      toolPath(bin, "pg_dump"),
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--no-password",
        "--lock-wait-timeout=10000",
        ...(prepared.dumpArgs ?? []),
      ],
      {
        env: prepared.env,
        signal: controller.signal,
        timeoutMs: limits.timeoutMs,
        consume: (stdout) =>
          encryptArchive(
            stdout,
            key,
            {
              id,
              createdAt: new Date().toISOString(),
              postgresVersion: prepared.serverVersion,
              codeCommit,
            },
            file,
            { maxBytes: limits.maxBytes, signal: controller.signal },
          ),
      },
    );
    await file.sync();
    const stamp = await file.stat();
    await authenticate(file, key, manifest, controller.signal);
    await structure(file, key, manifest, bin, {
      signal: controller.signal,
      timeoutMs: limits.timeoutMs,
    });
    await checkUnchanged(file, stamp);
    await file.close();
    file = null;
    if (controller.signal.aborted) throw Error("Cancelled before publication");
    const marker = await open(join(bundle, "manifest.json"), "wx", 0o600);
    try {
      await marker.writeFile(JSON.stringify(manifest, null, 2));
      await marker.sync();
    } finally {
      await marker.close();
    }
    if (controller.signal.aborted) throw Error("Cancelled during publication");
    return {
      id,
      bundle,
      manifest,
      backupMs: Math.round(performance.now() - start),
    };
  } catch {
    if (file) await file.close().catch(() => {});
    if (owned && dirname(resolve(bundle)) === root)
      await rm(bundle, { recursive: true, force: true }).catch(() => {});
    throw Error("Streaming backup failed; no valid backup published");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (prepared.env) delete prepared.env.PGPASSWORD;
  }
}
export async function createLocalStreaming(options) {
  const config = validateLocalConfig(options.config);
  const { client, serverVersion } = await connectLocal(config);
  try {
    return await createPrepared({
      ...options,
      prepared: { serverVersion, env: childEnvironment(config) },
    });
  } finally {
    await client.end();
  }
}
export async function createAuthorizedStreaming(options) {
  validateSource(options.config, options.policy);
  await assertTools(options.bin);
  await assertPrivatePath(options.output);
  const prepared = await prepareSource(options.config, options.policy);
  return createPrepared({ ...options, prepared });
}
/** Test harnesses may use createLocalStreaming or encryptArchive; no source-policy bypass is exported. */
export async function verifyStreaming(options) {
  const limits = validateLimits(options);
  await assertTools(options.bin);
  const opened = await openBundle(options.bundle);
  if (opened.legacy) return verifyBackup(options);
  const controller = new AbortController(),
    abort = () => controller.abort(),
    timer = setTimeout(abort, limits.timeoutMs);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    await authenticate(
      opened.file,
      options.key,
      opened.manifest,
      controller.signal,
    );
    await structure(opened.file, options.key, opened.manifest, options.bin, {
      ...limits,
      signal: controller.signal,
    });
    await checkUnchanged(opened.file, opened.stamp);
    return {
      id: opened.manifest.id,
      createdAt: opened.manifest.createdAt,
      sha256: opened.manifest.plainSha256,
      authenticated: true,
      archiveStructure: true,
      restoreTest: "not-tested",
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    await opened.file.close();
  }
}
export async function restoreStreaming(options) {
  const config = validateLocalConfig(options.config),
    limits = validateLimits(options);
  await assertTools(options.bin);
  const { client } = await connectLocal(config);
  let opened;
  const controller = new AbortController(),
    abort = () => controller.abort(),
    timer = setTimeout(abort, limits.timeoutMs);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    await assertEmpty(client);
    opened = await openBundle(options.bundle);
    if (opened.legacy)
      return await restoreBackup({ ...options, signal: controller.signal });
    await authenticate(
      opened.file,
      options.key,
      opened.manifest,
      controller.signal,
    );
    await structure(opened.file, options.key, opened.manifest, options.bin, {
      signal: controller.signal,
      timeoutMs: limits.timeoutMs,
    });
    await checkUnchanged(opened.file, opened.stamp);
    await assertEmpty(client);
    const input = (async function* () {
      yield* readArchive(opened.file, options.key, opened.manifest, {
        signal: controller.signal,
      });
      await checkUnchanged(opened.file, opened.stamp);
    })();
    // pg_restore can finish and COMMIT before stdin EOF. It must never own the transaction.
    // Generate SQL in a bounded pipe; psql commits only after authenticated input + successful
    // pg_restore completion release its EOF. No SQL or plaintext file is created.
    // Schema-filtered dumps create public: clean is allowed only behind the empty 9A guards.
    const start = performance.now();
    await streamProcess(
      toolPath(options.bin, "pg_restore"),
      [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--file=-",
      ],
      {
        input,
        signal: controller.signal,
        timeoutMs: limits.timeoutMs,
        consume: async (stdout, upstreamSucceeded) => {
          const sql = (async function* () {
            for await (const b of stdout) yield b;
            await upstreamSucceeded();
          })();
          await streamProcess(
            toolPath(options.bin, "psql"),
            [
              "-X",
              "--no-password",
              "--single-transaction",
              "--set",
              "ON_ERROR_STOP=1",
              "--file=-",
              "--dbname",
              config.database,
            ],
            {
              env: childEnvironment(config),
              input: sql,
              signal: controller.signal,
              timeoutMs: limits.timeoutMs,
            },
          );
        },
      },
    );
    return {
      id: opened.manifest.id,
      restoreMs: Math.round(performance.now() - start),
      restored: true,
      dataComparison: "required",
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    if (opened?.file) await opened.file.close();
    await client.end();
  }
}
export async function catalogStreaming(options) {
  await assertPrivatePath(options.output);
  const entries = [];
  for (const name of (await readdir(options.output)).sort()) {
    if (!name.startsWith("backup-")) continue;
    const bundle = join(options.output, name);
    if (!(await lstat(bundle)).isDirectory()) throw Error("Invalid catalogue");
    const v = await verifyStreaming({ ...options, bundle });
    if (v.id !== name) throw Error("Catalogue ID mismatch");
    entries.push({
      id: v.id,
      createdAt: v.createdAt,
      sha256: v.sha256,
      validated: true,
    });
  }
  return { ...retentionPlan(entries), validatedBundles: entries.length };
}
