import pg from "pg";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { childEnvironment } from "./safety.mjs";
import { readPrivateFile } from "./private-file.mjs";
const fail = () => Error("Explicit authorized TLS source required");
const fields = [
  "projectRef",
  "host",
  "port",
  "database",
  "user",
  "mode",
  "schemas",
  "passwordFile",
  "caFile",
];
const originFields = ["host", "port", "database", "user", "mode", "schemas"];
function exactKeys(value, allowed) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === allowed.length &&
    Object.keys(value).every((k) => allowed.includes(k))
  );
}
export function validateSource(config, policy) {
  if (
    !exactKeys(config, fields) ||
    !exactKeys(policy, ["enabled", "projectRef", "origins"]) ||
    policy.enabled !== true ||
    !Array.isArray(policy.origins) ||
    policy.origins.length !== 1 ||
    !exactKeys(policy.origins[0], originFields) ||
    !/^[a-z]{20}$/.test(config.projectRef) ||
    config.projectRef !== policy.projectRef ||
    config.port !== 5432 ||
    config.database !== "postgres" ||
    !["direct", "session"].includes(config.mode) ||
    !Array.isArray(config.schemas) ||
    config.schemas.length !== 1 ||
    config.schemas[0] !== "public" ||
    typeof config.user !== "string" ||
    !isAbsolute(config.passwordFile) ||
    !isAbsolute(config.caFile)
  )
    throw fail();
  if (
    config.mode === "direct"
      ? config.host !== `db.${config.projectRef}.supabase.co` ||
        !/^[a-z][a-z0-9_]{0,62}$/.test(config.user)
      : typeof config.host !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,62}\.pooler\.supabase\.com$/.test(config.host) ||
        !new RegExp("^[a-z][a-z0-9_]{0,40}\\." + config.projectRef + "$").test(
          config.user,
        )
  )
    throw fail();
  const origin = policy.origins[0];
  for (const field of originFields)
    if (JSON.stringify(config[field]) !== JSON.stringify(origin[field]))
      throw fail();
  return { ...config, schemas: [...config.schemas] };
}
/** Only public global-unicast endpoints; no local test exception in this module. */
export function safeAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  return (
    isIP(address) === 6 &&
    /^[23][a-f0-9]{0,3}:/i.test(address) &&
    !/^2001:db8:/i.test(address)
  );
}
export function sourceEnvironment(config, { address, password }) {
  return {
    ...childEnvironment(),
    PGHOST: config.host,
    PGHOSTADDR: address,
    PGPORT: String(config.port),
    PGDATABASE: config.database,
    PGUSER: config.user,
    PGPASSWORD: password,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: config.caFile,
    PGSSLMINPROTOCOLVERSION: "TLSv1.2",
    PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "tecnodesk-backup-authorized-export",
    PGOPTIONS: "-c default_transaction_read_only=on",
  };
}
export async function verifySourceConnection(
  config,
  { address, password, ca },
) {
  const client = new pg.Client({
    host: address,
    port: config.port,
    database: config.database,
    user: config.user,
    password,
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: config.host,
      minVersion: "TLSv1.2",
    },
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    application_name: "tecnodesk-backup-source-check",
    options: "-c default_transaction_read_only=on",
  });
  try {
    await client.connect();
    const {
      rows: [r],
    } = await client.query(
      "SELECT current_database() db,current_user username,current_setting('server_version_num')::int version,current_setting('server_version') version_text,current_setting('transaction_read_only') readonly,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) tls",
    );
    if (
      r.db !== config.database ||
      r.username !==
        (config.mode === "session" ? config.user.split(".")[0] : config.user) ||
      r.version < 170000 ||
      r.version >= 180000 ||
      r.readonly !== "on" ||
      r.tls !== true
    )
      throw fail();
    return r.version_text;
  } catch {
    throw Error("Source TLS/identity/read-only verification failed");
  } finally {
    await client.end().catch(() => {});
  }
}
export async function prepareSource(config, policy) {
  config = validateSource(config, policy);
  const passwordBytes = await readPrivateFile(config.passwordFile, {
    outsideGit: true,
    limit: 4096,
  });
  try {
    const password = passwordBytes.toString("utf8");
    if (!password || /[\r\n\0]/.test(password)) throw fail();
    const ca = (
      await readPrivateFile(config.caFile, { limit: 65536 })
    ).toString("utf8");
    if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw fail();
    const addresses = await lookup(config.host, { all: true });
    if (!addresses.length || addresses.some((a) => !safeAddress(a.address)))
      throw fail();
    const address = addresses[0].address;
    const serverVersion = await verifySourceConnection(config, {
      address,
      password,
      ca,
    });
    return {
      serverVersion,
      env: sourceEnvironment(config, { address, password }),
      dumpArgs: ["--schema=public"],
    };
  } finally {
    passwordBytes.fill(0);
  }
}
