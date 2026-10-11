import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
const MAGIC = Buffer.from("TDBACK02");
const CHUNK = 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 64 * 1024 ** 3;
const reject = () => Error("Streaming backup authentication or format failed");
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
function keys(key, salt) {
  if (
    !Buffer.isBuffer(key) ||
    key.length !== 32 ||
    !Buffer.isBuffer(salt) ||
    salt.length !== 32
  )
    throw reject();
  return ["encryption", "manifest"].map((label) =>
    Buffer.from(
      hkdfSync("sha256", key, salt, "tecnodesk-backup-v2-" + label, 32),
    ),
  );
}
function nonce(index) {
  const iv = Buffer.alloc(12);
  iv.writeUInt32BE(index, 8);
  return iv;
}
function frameHeader(type, index, length) {
  const b = Buffer.alloc(9);
  b[0] = type;
  b.writeUInt32BE(index, 1);
  b.writeUInt32BE(length, 5);
  return b;
}
const sign = (key, manifest) =>
  createHmac("sha256", key).update(canonical(manifest)).digest("hex");
export function validateLimits({
  maxBytes = 4 * 1024 ** 3,
  timeoutMs = 900000,
} = {}) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_ARCHIVE_BYTES ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 3600000
  )
    throw Error("Invalid bounded resource limits");
  return { maxBytes, timeoutMs };
}
function checkAbort(signal) {
  if (signal?.aborted) throw Error("Streaming backup cancelled");
}
async function writeAll(file, bytes) {
  let p = 0;
  while (p < bytes.length) {
    const { bytesWritten } = await file.write(bytes, p, bytes.length - p, null);
    if (!bytesWritten) throw Error("Backup write failed");
    p += bytesWritten;
  }
}
/** Only authenticated encrypted bytes are written; memory is bounded by one frame. */
export async function encryptArchive(
  source,
  key,
  details,
  file,
  { maxBytes, signal } = {},
) {
  const limits = validateLimits({ maxBytes });
  const salt = randomBytes(32);
  const header = {
    version: 2,
    id: details.id,
    createdAt: details.createdAt,
    postgresVersion: details.postgresVersion,
    codeCommit: details.codeCommit ?? null,
    format: "pg_dump-custom",
    clientMajor: 17,
    chunkBytes: CHUNK,
    salt: salt.toString("hex"),
  };
  if (
    !/^backup-[a-zA-Z0-9_-]+$/.test(header.id) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(header.createdAt) ||
    typeof header.postgresVersion !== "string" ||
    header.postgresVersion.length > 80 ||
    (header.codeCommit !== null && !/^[a-f0-9]{40}$/.test(header.codeCommit))
  )
    throw reject();
  const encoded = Buffer.from(canonical(header)),
    prefix = Buffer.alloc(12);
  MAGIC.copy(prefix);
  prefix.writeUInt32BE(encoded.length, 8);
  const [encryptionKey, manifestKey] = keys(key, salt),
    plainHash = createHash("sha256"),
    encryptedHash = createHash("sha256");
  let plainSize = 0,
    encryptedSize = 0,
    index = 0,
    used = 0;
  const work = Buffer.alloc(CHUNK);
  async function output(b) {
    checkAbort(signal);
    await writeAll(file, b);
    encryptedHash.update(b);
    encryptedSize += b.length;
  }
  async function frame(type, data) {
    if (index >= 0xffffffff) throw reject();
    const head = frameHeader(type, index++, data.length),
      cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce(index - 1));
    cipher.setAAD(Buffer.concat([prefix, encoded, head]));
    const bytes = Buffer.concat([
      head,
      cipher.update(data),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    await output(bytes);
  }
  try {
    await output(prefix);
    await output(encoded);
    for await (const incoming of source) {
      checkAbort(signal);
      const b = Buffer.isBuffer(incoming) ? incoming : Buffer.from(incoming);
      plainSize += b.length;
      if (plainSize > limits.maxBytes)
        throw Error("Backup resource limit exceeded");
      plainHash.update(b);
      let p = 0;
      while (p < b.length) {
        const n = Math.min(CHUNK - used, b.length - p);
        b.copy(work, used, p, p + n);
        used += n;
        p += n;
        if (used === CHUNK) {
          await frame(0, work);
          work.fill(0);
          used = 0;
        }
      }
    }
    if (used) await frame(0, work.subarray(0, used));
    if (plainSize < 32) throw reject();
    const plainSha256 = plainHash.digest("hex"),
      blocks = index;
    await frame(1, Buffer.from(canonical({ blocks, plainSize, plainSha256 })));
    const manifest = {
      ...header,
      plainSize,
      plainSha256,
      blocks,
      encryptedSize,
      encryptedSha256: encryptedHash.digest("hex"),
      archiveValidation: "structure-checked",
      restoreTest: "not-tested",
    };
    return { ...manifest, authentication: sign(manifestKey, manifest) };
  } finally {
    work.fill(0);
    encryptionKey.fill(0);
    manifestKey.fill(0);
  }
}
/** Each yielded buffer belongs to the caller; no frame is yielded before its GCM tag verifies. */
export async function* readArchive(file, key, manifest, { signal } = {}) {
  let position = 0;
  const encryptedHash = createHash("sha256"),
    plainHash = createHash("sha256");
  let plainSize = 0,
    index = 0;
  const ciphertext = Buffer.alloc(CHUNK);
  async function read(n, target) {
    checkAbort(signal);
    const b = target ?? Buffer.alloc(n);
    let got = 0;
    while (got < n) {
      const r = await file.read(b, got, n - got, position);
      if (!r.bytesRead) throw reject();
      got += r.bytesRead;
      position += r.bytesRead;
    }
    encryptedHash.update(b);
    return b;
  }
  const prefix = await read(12);
  if (
    !prefix.subarray(0, 8).equals(MAGIC) ||
    prefix.readUInt32BE(8) > 4096 ||
    prefix.readUInt32BE(8) < 1
  )
    throw reject();
  const encoded = await read(prefix.readUInt32BE(8));
  let header;
  try {
    header = JSON.parse(encoded);
  } catch {
    throw reject();
  }
  if (
    header.version !== 2 ||
    header.chunkBytes !== CHUNK ||
    header.format !== "pg_dump-custom" ||
    header.clientMajor !== 17 ||
    !/^[a-f0-9]{64}$/.test(header.salt)
  )
    throw reject();
  const [encryptionKey, manifestKey] = keys(
    key,
    Buffer.from(header.salt, "hex"),
  );
  try {
    const { authentication, ...signed } = manifest ?? {};
    if (
      typeof authentication !== "string" ||
      !/^[a-f0-9]{64}$/.test(authentication) ||
      !timingSafeEqual(
        Buffer.from(authentication, "hex"),
        Buffer.from(sign(manifestKey, signed), "hex"),
      )
    )
      throw reject();
    for (const [name, value] of Object.entries(header))
      if (manifest[name] !== value) throw reject();
    if (
      !Number.isSafeInteger(manifest.plainSize) ||
      manifest.plainSize < 32 ||
      manifest.plainSize > MAX_ARCHIVE_BYTES ||
      !Number.isSafeInteger(manifest.encryptedSize) ||
      manifest.encryptedSize < 32 ||
      manifest.encryptedSize > MAX_ARCHIVE_BYTES + 4 * 1024 * 1024 ||
      !Number.isSafeInteger(manifest.blocks) ||
      manifest.blocks < 1 ||
      manifest.blocks > 65536 ||
      !/^backup-[a-zA-Z0-9_-]+$/.test(manifest.id) ||
      manifest.archiveValidation !== "structure-checked" ||
      manifest.restoreTest !== "not-tested" ||
      !/^[a-f0-9]{64}$/.test(manifest.plainSha256) ||
      !/^[a-f0-9]{64}$/.test(manifest.encryptedSha256)
    )
      throw reject();
    while (true) {
      const head = await read(9),
        type = head[0],
        number = head.readUInt32BE(1),
        length = head.readUInt32BE(5);
      if (
        number !== index ||
        index > manifest.blocks ||
        !(
          (type === 0 && length > 0 && length <= CHUNK) ||
          (type === 1 && length > 0 && length <= 4096)
        )
      )
        throw reject();
      const encrypted = await read(length, ciphertext.subarray(0, length)),
        tag = await read(16),
        decipher = createDecipheriv("aes-256-gcm", encryptionKey, nonce(index));
      decipher.setAAD(Buffer.concat([prefix, encoded, head]));
      decipher.setAuthTag(tag);
      let plain;
      try {
        plain = decipher.update(encrypted);
        if (decipher.final().length !== 0) throw reject();
      } catch {
        plain?.fill(0);
        throw reject();
      }
      if (type === 0) {
        index++;
        plainSize += plain.length;
        if (plainSize > manifest.plainSize) throw reject();
        plainHash.update(plain);
        yield plain;
        continue;
      }
      let footer;
      try {
        footer = JSON.parse(plain);
      } catch {
        throw reject();
      } finally {
        plain.fill(0);
      }
      if (
        index !== manifest.blocks ||
        footer.blocks !== index ||
        footer.plainSize !== plainSize ||
        footer.plainSha256 !== manifest.plainSha256 ||
        plainSize !== manifest.plainSize ||
        plainHash.digest("hex") !== manifest.plainSha256 ||
        position !== manifest.encryptedSize ||
        encryptedHash.digest("hex") !== manifest.encryptedSha256
      )
        throw reject();
      const trailing = Buffer.alloc(1);
      if ((await file.read(trailing, 0, 1, position)).bytesRead) throw reject();
      return;
    }
  } finally {
    encryptionKey.fill(0);
    manifestKey.fill(0);
  }
}
