import assert from "node:assert/strict";
import { childEnvironment } from "../scripts/backup/safety.mjs";
let error;
try {
  const { validateSource, sourceEnvironment, safeAddress } = await import(
    "../scripts/backup/source.mjs"
  );
  const ref = "abcdefghijklmnopqrst",
    host = `db.${ref}.supabase.co`;
  const config = {
    projectRef: ref,
    host,
    port: 5432,
    database: "postgres",
    user: "backup_reader",
    mode: "direct",
    schemas: ["public"],
    passwordFile: "/private/password",
    caFile: "/private/ca.pem",
  };
  const policy = {
    enabled: true,
    projectRef: ref,
    origins: [
      {
        host,
        port: 5432,
        database: "postgres",
        user: "backup_reader",
        mode: "direct",
        schemas: ["public"],
      },
    ],
  };
  assert.equal(validateSource(config, policy).host, host);
  for (const [c, p] of [
    [config, { ...policy, enabled: false }],
    [config, { ...policy, origins: [] }],
    [{ ...config, projectRef: "wrong" }, policy],
    [{ ...config, port: 6543 }, policy],
    [{ ...config, mode: "transaction" }, policy],
    [{ ...config, host: host + ".evil" }, policy],
    [{ ...config, schemas: ["auth"] }, policy],
    [{ ...config, sslmode: "require" }, policy],
    [{ ...config, user: "postgres; options" }, policy],
  ])
    assert.throws(() => validateSource(c, p));
  const pool = "aws-0-example.pooler.supabase.com",
    session = {
      ...config,
      host: pool,
      mode: "session",
      user: "backup_reader." + ref,
    },
    pp = {
      ...policy,
      origins: [
        {
          host: pool,
          port: 5432,
          database: "postgres",
          mode: "session",
          user: session.user,
          schemas: ["public"],
        },
      ],
    };
  assert.equal(validateSource(session, pp).mode, "session");
  assert.throws(() =>
    validateSource({ ...session, user: "backup_reader.wrong" }, pp),
  );
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fd00::1",
    "0.0.0.0",
  ])
    assert.equal(safeAddress(ip), false);
  assert.equal(safeAddress("8.8.8.8"), true);
  assert.equal(safeAddress("2606:4700::1111"), true);
  process.env.DATABASE_URL = "sensitive-production";
  process.env.PGOPTIONS = "danger";
  process.env.PGSERVICE = "inherited";
  const env = sourceEnvironment(config, {
    address: "8.8.8.8",
    password: "fictitious-only",
  });
  assert.equal(env.PGSSLMODE, "verify-full");
  assert.equal(env.PGHOST, host);
  assert.equal(env.PGHOSTADDR, "8.8.8.8");
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PGOPTIONS, "-c default_transaction_read_only=on");
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(childEnvironment().DATABASE_URL, undefined);
  delete process.env.DATABASE_URL;
  delete process.env.PGOPTIONS;
  delete process.env.PGSERVICE;
} catch (e) {
  error = e;
}
assert.equal(
  error,
  undefined,
  "Remote source must require explicit policy, exact endpoint, strict TLS and sanitized environment",
);
console.log(
  "PASS deny-by-default exact source policy, mode/project/schema/host rejection and isolated TLS environment",
);
