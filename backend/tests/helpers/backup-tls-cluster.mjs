import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  runTool,
  toolPath,
  childEnvironment,
} from "../../scripts/backup/safety.mjs";
import {
  validateSource,
  verifySourceConnection,
  sourceEnvironment,
} from "../../scripts/backup/source.mjs";
import { encryptArchive } from "../../scripts/backup/stream-format.mjs";
import { streamProcess } from "../../scripts/backup/stream-process.mjs";
export const testRef = "abcdefghijklmnopqrst";
export const testHost = `db.${testRef}.supabase.co`;
export async function nodeRun(args, env, cwd) {
  return new Promise((ok, no) => {
    const c = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    c.stdout.on("data", (b) => {
      out += b;
      if (out.length > 1024 * 1024) c.kill();
    });
    c.stderr.on("data", () => {});
    const t = setTimeout(() => c.kill(), 240000);
    c.once("error", () => {});
    c.once("close", (code) => {
      clearTimeout(t);
      code === 0 ? ok(out) : no(Error("Owned synthetic subprocess failed"));
    });
  });
}
export async function startTLSCluster(bin) {
  const root = await mkdtemp(join(tmpdir(), "tecnodesk-security9b-")),
    cluster = join(root, "cluster"),
    suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const pgctl = (args) =>
    new Promise((ok, no) => {
      const c = spawn(toolPath(bin, "pg_ctl"), args, {
        env: childEnvironment(),
        stdio: "ignore",
        windowsHide: true,
      });
      c.once("error", () => no(Error("Owned cluster control failed")));
      c.once("close", (code) =>
        code === 0 ? ok() : no(Error("Owned cluster control failed")),
      );
    });
  let started = false,
    maintenance;
  async function cleanup() {
    await maintenance?.end();
    assertOwned();
    if (started) {
      try {
        await pgctl(["-D", cluster, "status"]);
        await pgctl(["-D", cluster, "-m", "fast", "-w", "stop"]);
      } catch {
        if (
          await readFile(join(cluster, "postmaster.pid"), "utf8").catch(
            () => "",
          )
        )
          throw Error("Owned TLS cluster cleanup requires attention");
      }
    }
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
  function assertOwned() {
    if (
      dirname(resolve(root)) !== resolve(tmpdir()) ||
      !root.startsWith(join(resolve(tmpdir()), "tecnodesk-security9b-"))
    )
      throw Error("Invalid owned test path");
  }
  try {
    if (process.platform === "win32") {
      const script =
        "$ErrorActionPreference='Stop';$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false);$me=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl.SetOwner($me);foreach($sid in @($me.Value,'S-1-5-18','S-1-5-32-544')){$id=New-Object Security.Principal.SecurityIdentifier($sid);$r=New-Object Security.AccessControl.FileSystemAccessRule($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($r)};Set-Acl -LiteralPath $env:TASK_PRIVATE_ROOT -AclObject $acl";
      await new Promise((ok, no) => {
        const c = spawn(
          join(
            process.env.SystemRoot,
            "System32/WindowsPowerShell/v1.0/powershell.exe",
          ),
          ["-NoProfile", "-NonInteractive", "-Command", script],
          {
            env: { ...childEnvironment(), TASK_PRIVATE_ROOT: root },
            stdio: "ignore",
            windowsHide: true,
          },
        );
        c.once("error", () => no(Error("Owned ACL failed")));
        c.once("close", (code) =>
          code === 0 ? ok() : no(Error("Owned ACL failed")),
        );
      });
    }
    const openssl =
      process.env.TEST_OPENSSL_BIN ||
      (process.platform === "win32"
        ? "C:/Program Files/Git/usr/bin/openssl.exe"
        : "/usr/bin/openssl");
    const cert = join(root, "fictitious-cert.pem"),
      untrustedCert = join(root, "fictitious-untrusted-cert.pem"),
      privateKey = join(root, "fictitious-key.pem"),
      conf = join(root, "openssl.cnf");
    await writeFile(
      conf,
      `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=${testHost}\n[ext]\nsubjectAltName=DNS:${testHost},DNS:aws-0-example.pooler.supabase.com\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n`,
    );
    await runTool(openssl, [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "2",
      "-config",
      conf,
      "-keyout",
      privateKey,
      "-out",
      cert,
    ]);
    await chmod(privateKey, 0o600);
    await runTool(openssl, [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "2",
      "-config",
      conf,
      "-keyout",
      join(root, "fictitious-untrusted-key.pem"),
      "-out",
      untrustedCert,
    ]);
    await runTool(toolPath(bin, "initdb"), [
      "-D",
      cluster,
      "-U",
      "postgres",
      "-A",
      "trust",
      "-E",
      "UTF8",
      "--no-locale",
    ]);
    const quote = (p) => p.replaceAll("\\", "/").replaceAll("'", "''");
    await writeFile(
      join(cluster, "postgresql.conf"),
      `\nssl=on\nssl_cert_file='${quote(cert)}'\nssl_key_file='${quote(privateKey)}'\n`,
      { flag: "a" },
    );
    started = true;
    await pgctl([
      "-D",
      cluster,
      "-l",
      join(root, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${port}` +
        (process.platform === "win32" ? "" : ` -k "${root}"`),
      "-w",
      "start",
    ]);
    maintenance = new pg.Client({
      host: "127.0.0.1",
      port,
      database: "postgres",
      user: "postgres",
    });
    await maintenance.connect();
    const local = (database) => ({
      host: "127.0.0.1",
      port,
      database,
      user: "postgres",
      password: "",
      disposable: true,
    });
    return {
      root,
      cluster,
      port,
      suffix,
      cert,
      untrustedCert,
      maintenance,
      cleanup,
      local,
    };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
/** ONLY TEST CODE maps a pretend approved public endpoint to the owned TLS server. */
export async function simulatedSource(
  cluster,
  { wrongName = false, badCA = false, denied = false, mode = "direct" } = {},
) {
  const host =
      mode === "direct" ? testHost : "aws-0-example.pooler.supabase.com",
    baseUser = denied ? "security9b_denied" : "backup_reader";
  const config = {
    projectRef: testRef,
    host,
    port: 5432,
    database: "postgres",
    user: mode === "session" ? baseUser + "." + testRef : baseUser,
    mode,
    schemas: ["public"],
    passwordFile: join(cluster.root, "fictitious-password"),
    caFile: cluster.cert,
  };
  const policy = {
    enabled: true,
    projectRef: testRef,
    origins: [
      {
        host,
        port: 5432,
        database: "postgres",
        user: config.user,
        mode,
        schemas: ["public"],
      },
    ],
  };
  validateSource(config, policy);
  const ca = await readFile(
    badCA ? cluster.untrustedCert : cluster.cert,
    "utf8",
  );
  // Port translation models a test transport, not a production source exception.
  const transport = {
    ...config,
    port: cluster.port,
    user: baseUser,
    mode: "direct",
    host: wrongName ? "wrong-name.example.invalid" : host,
  };
  const serverVersion = await verifySourceConnection(transport, {
    address: "127.0.0.1",
    password: "synthetic-only-password",
    ca,
  });
  const env = sourceEnvironment(transport, {
    address: "127.0.0.1",
    password: "synthetic-only-password",
  });
  return { serverVersion, env, config, policy };
}
export async function simulatedTLSBackup({
  cluster,
  key,
  bin,
  output,
  signal,
  maxBytes = 4 * 1024 ** 3,
  timeoutMs = 900000,
  denied = false,
  mode = "direct",
}) {
  const prepared = await simulatedSource(cluster, { denied, mode }),
    id = "backup-" + randomUUID(),
    bundle = join(output, id);
  await mkdir(bundle, { mode: 0o700 });
  let file;
  try {
    file = await import("node:fs/promises").then((fs) =>
      fs.open(join(bundle, "archive.tdbackup"), "wx+", 0o600),
    );
    const start = performance.now();
    const manifest = await streamProcess(
      toolPath(bin, "pg_dump"),
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--no-password",
        "--schema=public",
        "--lock-wait-timeout=10000",
      ],
      {
        env: prepared.env,
        signal,
        timeoutMs,
        consume: (stdout) =>
          encryptArchive(
            stdout,
            key,
            {
              id,
              createdAt: new Date().toISOString(),
              postgresVersion: prepared.serverVersion,
            },
            file,
            { maxBytes, signal },
          ),
      },
    );
    await file.sync();
    await file.close();
    file = null;
    await writeFile(join(bundle, "manifest.json"), JSON.stringify(manifest), {
      flag: "wx",
      mode: 0o600,
    });
    return {
      id,
      bundle,
      manifest,
      backupMs: Math.round(performance.now() - start),
    };
  } catch {
    await file?.close();
    await rm(bundle, { recursive: true, force: true });
    throw Error("Simulated TLS backup rejected");
  } finally {
    delete prepared.env.PGPASSWORD;
  }
}
export async function snapshot(client) {
  const tables = (
      await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'security9b_payload' ORDER BY tablename",
      )
    ).rows.map((x) => x.tablename),
    rows = {};
  for (const t of tables)
    rows[t] = (
      await client.query(
        `SELECT row_to_json(t) data FROM "${t.replaceAll('"', '""')}" t ORDER BY row_to_json(t)::text`,
      )
    ).rows.map((x) => x.data);
  const constraints = (
    await client.query(
      "SELECT conname,convalidated,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY conname",
    )
  ).rows;
  const indexes = (
    await client.query(
      "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname",
    )
  ).rows;
  const sequences = (
    await client.query(
      "SELECT sequencename,last_value,start_value,increment_by FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename",
    )
  ).rows;
  return { rows, constraints, indexes, sequences };
}
