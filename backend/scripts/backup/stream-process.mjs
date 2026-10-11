import { spawn } from "node:child_process";
import { childEnvironment } from "./safety.mjs";
/** A child owns no inherited sensitive environment; errors/SQL never leave this boundary. */
export async function streamProcess(
  command,
  args,
  {
    env = childEnvironment(),
    input,
    consume,
    signal,
    timeoutMs = 900000,
    allowEarlyInputClose = false,
  } = {},
) {
  if (signal?.aborted) throw Error("PostgreSQL stream cancelled");
  let failed = false,
    closed = false,
    exitCode = null,
    child,
    reason = "PROCESS";
  try {
    child = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
  } catch {
    throw Error("PostgreSQL stream failed");
  }
  let finish;
  const completion = new Promise((resolve) => {
    finish = resolve;
  });
  const stop = () => {
    failed = true;
    child.kill();
  };
  child.on("error", stop);
  child.on("close", (code) => {
    closed = true;
    exitCode = code;
    finish();
  });
  child.stderr.on("data", (b) => {
    const s = b.toString();
    if (/schema "public" already exists/i.test(s))
      reason = "PUBLIC_SCHEMA_EXISTS";
    else if (/permission denied/i.test(s)) reason = "PERMISSION";
    else if (/could not read|unexpected end|corrupt|block ID/i.test(s))
      reason = "ARCHIVE_INPUT";
    else if (/could not execute|COPY failed|ERROR:/i.test(s)) reason = "SQL";
  });
  child.stdin.on("error", () => {
    if (!allowEarlyInputClose) stop();
  });
  const timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener("abort", stop, { once: true });
  const writer = (async () => {
    if (!input) {
      child.stdin.end();
      return;
    }
    try {
      for await (const b of input) {
        if (closed) {
          if (allowEarlyInputClose) break;
          throw Error("Child disconnected");
        }
        await new Promise((ok, no) =>
          child.stdin.write(b, (e) => (e ? no(e) : ok())),
        );
        b.fill(0);
      }
      if (!closed) child.stdin.end();
    } catch {
      if (!allowEarlyInputClose) {
        reason = "INPUT";
        stop();
      } else if (!child.stdin.destroyed) stop();
    }
  })();
  // Consumers may gate their own final EOF on both authenticated input and child success.
  // This excludes reader itself, avoiding a circular pipeline wait.
  const inputAndProcessSucceeded = async () => {
    await Promise.all([writer, completion]);
    if (failed || exitCode !== 0)
      throw Error("PostgreSQL upstream stream failed");
  };
  const reader = (async () => {
    try {
      if (consume) return await consume(child.stdout, inputAndProcessSucceeded);
      for await (const _ of child.stdout) {
      }
    } catch {
      stop();
    }
  })();
  try {
    const results = await Promise.all([writer, reader, completion]);
    if (failed || exitCode !== 0)
      throw Error("PostgreSQL stream failed or cancelled (" + reason + ")");
    return results[1];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
    if (!closed) {
      stop();
      await completion;
    }
  }
}
