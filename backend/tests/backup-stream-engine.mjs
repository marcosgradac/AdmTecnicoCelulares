import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
let failure;
const root = await mkdtemp(join(tmpdir(), "tecnodesk-stream-engine-"));
try {
  const { createLocalStreaming, restoreStreaming, createAuthorizedStreaming } =
    await import("../scripts/backup/stream-engine.mjs");
  const config = {
      host: "db.fake.supabase.co",
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: "fictitious",
      disposable: true,
    },
    key = randomBytes(32);
  await assert.rejects(
    () => createLocalStreaming({ config, key, bin: root, output: root }),
    /Disposable local/,
  );
  await assert.rejects(
    () => restoreStreaming({ config, key, bin: root, bundle: root }),
    /Disposable local/,
  );
  await assert.rejects(
    () =>
      createAuthorizedStreaming({
        config,
        policy: { enabled: false },
        key,
        bin: root,
        output: root,
      }),
    /authorized TLS source/,
  );
  assert.deepEqual(await readdir(root), []);
} catch (e) {
  failure = e;
} finally {
  await rm(root, { recursive: true, force: true });
}
assert.equal(
  failure,
  undefined,
  "Streaming tools must reject wrong destinations and disabled remote source before side effects",
);
console.log(
  "PASS stream engine fails closed before network, file publication and remote restoration",
);
