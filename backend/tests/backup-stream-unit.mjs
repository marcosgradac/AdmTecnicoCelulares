import assert from "node:assert/strict";
import { mkdtemp, open, readFile, writeFile, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
const root = await mkdtemp(join(tmpdir(), "tecnodesk-stream-unit-"));
const key = randomBytes(32);
try {
  let implementationError;
  try {
    const { encryptArchive, readArchive } = await import(
      "../scripts/backup/stream-format.mjs"
    );
    const path = join(root, "archive.tdbackup"),
      file = await open(path, "wx+", 0o600);
    const plain = Buffer.concat([
      Buffer.from("PGDMP"),
      randomBytes(2 * 1024 * 1024 + 17),
    ]);
    const header = {
      id: "backup-synthetic",
      createdAt: "2026-10-11T00:00:00.000Z",
      postgresVersion: "17.11",
      codeCommit: null,
    };
    const manifest = await encryptArchive(
      (async function* () {
        for (let i = 0; i < plain.length; i += 7171)
          yield plain.subarray(i, i + 7171);
      })(),
      key,
      header,
      file,
      { maxBytes: 10 * 1024 * 1024 },
    );
    await file.close();
    async function decode(path, manifest, key) {
      const f = await open(path, "r");
      try {
        const out = [];
        for await (const b of readArchive(f, key, manifest)) out.push(b);
        return Buffer.concat(out);
      } finally {
        await f.close();
      }
    }
    assert.deepEqual(await decode(path, manifest, key), plain);
    await assert.rejects(() => decode(path, manifest, randomBytes(32)));
    await assert.rejects(() =>
      decode(path, { ...manifest, plainSize: 1 }, key),
    );
    const original = await readFile(path);
    const otherPath = join(root, "independent.tdbackup"),
      otherFile = await open(otherPath, "wx+", 0o600);
    const otherManifest = await encryptArchive(
      (async function* () {
        yield plain;
      })(),
      key,
      header,
      otherFile,
    );
    await otherFile.close();
    assert.notEqual(otherManifest.salt, manifest.salt);
    assert.deepEqual(await decode(otherPath, otherManifest, key), plain);
    await assert.rejects(() => decode(otherPath, manifest, key));
    for (const [name, bytes] of [
      ["empty", Buffer.alloc(0)],
      ["truncate", original.subarray(0, -1)],
      ["trailing", Buffer.concat([original, Buffer.from("extra")])],
      ["corrupt", Buffer.from(original)],
      ["data-corrupt", Buffer.from(original)],
      ["tag-corrupt", Buffer.from(original)],
    ]) {
      if (name === "corrupt") bytes[bytes.length - 60] ^= 1;
      if (name === "data-corrupt")
        bytes[12 + original.readUInt32BE(8) + 9 + 4] ^= 1;
      if (name === "tag-corrupt")
        bytes[12 + original.readUInt32BE(8) + 9 + 1024 * 1024] ^= 1;
      const bad = join(root, name);
      await writeFile(bad, bytes);
      await assert.rejects(() => decode(bad, manifest, key));
    }
    // Swap complete data frames, preserving bytes and their valid tags: order must be bound.
    const n = original.readUInt32BE(8),
      start = 12 + n,
      len1 = 9 + original.readUInt32BE(start + 5) + 16,
      next = start + len1,
      len2 = 9 + original.readUInt32BE(next + 5) + 16;
    const reorder = Buffer.concat([
      original.subarray(0, start),
      original.subarray(next, next + len2),
      original.subarray(start, next),
      original.subarray(next + len2),
    ]);
    const duplicate = Buffer.concat([
      original.subarray(0, next),
      original.subarray(start, next),
      original.subarray(next),
    ]);
    for (const [name, b] of [
      ["reorder", reorder],
      ["duplicate", duplicate],
    ]) {
      const p = join(root, name);
      await writeFile(p, b);
      await assert.rejects(() => decode(p, manifest, key));
    }
  } catch (e) {
    implementationError = e;
  }
  assert.equal(
    implementationError,
    undefined,
    "Streaming archive must authenticate payload, order, manifest and EOF",
  );
  console.log(
    "PASS V2 block authentication, complete roundtrip, wrong key, manifest, order, duplicates and EOF",
  );
} finally {
  key.fill(0);
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  await rm(root, { recursive: true, force: true });
}
