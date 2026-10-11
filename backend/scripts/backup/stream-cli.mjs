import { assertPrivatePath } from "./safety.mjs";
import { readPrivateFile } from "./private-file.mjs";
import {
  createLocalStreaming,
  createAuthorizedStreaming,
  verifyStreaming,
  restoreStreaming,
  catalogStreaming,
} from "./stream-engine.mjs";
const [command, ...args] = process.argv.slice(2),
  abort = new AbortController();
for (const name of ["SIGINT", "SIGTERM"])
  process.once(name, () => abort.abort());
async function main() {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      ![
        "--config",
        "--policy",
        "--key-file",
        "--bin",
        "--output",
        "--bundle",
        "--commit",
        "--timeout-ms",
        "--max-bytes",
      ].includes(args[i]) ||
      !args[i + 1] ||
      flags[args[i]]
    )
      throw Error("Invalid arguments");
    flags[args[i]] = args[i + 1];
  }
  if (
    ![
      "create-local",
      "export-authorized",
      "verify",
      "restore",
      "catalog",
    ].includes(command) ||
    !flags["--key-file"] ||
    !flags["--bin"]
  )
    throw Error("Invalid command");
  if (command !== "export-authorized" && flags["--policy"])
    throw Error("Policy only applies to explicit export");
  await assertPrivatePath(flags["--key-file"], { key: true });
  const key = await readPrivateFile(flags["--key-file"], {
    outsideGit: true,
    limit: 32,
  });
  if (key.length !== 32) {
    key.fill(0);
    throw Error("Invalid key");
  }
  try {
    const config = ["create-local", "restore", "export-authorized"].includes(
      command,
    )
      ? JSON.parse(
          (
            await readPrivateFile(flags["--config"], { outsideGit: true })
          ).toString(),
        )
      : undefined;
    const policy =
      command === "export-authorized"
        ? JSON.parse(
            (
              await readPrivateFile(flags["--policy"], { outsideGit: true })
            ).toString(),
          )
        : undefined;
    const options = {
      config,
      policy,
      key,
      bin: flags["--bin"],
      output: flags["--output"],
      bundle: flags["--bundle"],
      codeCommit: flags["--commit"] ?? null,
      signal: abort.signal,
    };
    if (flags["--timeout-ms"])
      options.timeoutMs = Number(flags["--timeout-ms"]);
    if (flags["--max-bytes"]) options.maxBytes = Number(flags["--max-bytes"]);
    const result = await {
      "create-local": createLocalStreaming,
      "export-authorized": createAuthorizedStreaming,
      verify: verifyStreaming,
      restore: restoreStreaming,
      catalog: catalogStreaming,
    }[command](options);
    console.log(
      JSON.stringify(
        command === "catalog"
          ? result
          : {
              id: result.id,
              backupMs: result.backupMs,
              restoreMs: result.restoreMs,
              restored: result.restored,
              authenticated: result.authenticated,
              dataComparison: result.dataComparison,
            },
      ),
    );
  } finally {
    key.fill(0);
  }
}
main().catch(() => {
  console.error(
    "Streaming backup rejected or failed. No source rows were changed. Check private policy, TLS, tools, limits and integrity.",
  );
  process.exitCode = 1;
});
