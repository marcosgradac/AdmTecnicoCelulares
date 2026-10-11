import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { noSymlinkAncestors, childEnvironment } from "./safety.mjs";
export async function privateFile(
  path,
  { outsideGit = false, limit = 65536 } = {},
) {
  path = resolve(path);
  await noSymlinkAncestors(path);
  const before = await lstat(path);
  if (!before.isFile() || before.size < 1 || before.size > limit)
    throw Error("Invalid private file");
  if (outsideGit) {
    let p = dirname(path);
    while (true) {
      try {
        await lstat(join(p, ".git"));
        throw Error("Private configuration must stay outside Git");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const n = dirname(p);
      if (n === p) break;
      p = n;
    }
  }
  if (process.platform === "win32") {
    const script =
      "$ErrorActionPreference='Stop'; try { $acl=Get-Acl -LiteralPath $env:TASK_PRIVATE_FILE; $me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; foreach($ace in $acl.Access){if($ace.AccessControlType -eq 'Allow' -and (([int]$ace.FileSystemRights -band 1) -ne 0)){ $sid=$ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value; if($sid -notin @($me,'S-1-5-18','S-1-5-32-544')){exit 1}}};exit 0 } catch {exit 1}";
    await new Promise((ok, no) => {
      const c = spawn(
        join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe",
        ),
        ["-NoProfile", "-NonInteractive", "-Command", script],
        {
          env: { ...childEnvironment(), TASK_PRIVATE_FILE: path },
          stdio: "ignore",
          windowsHide: true,
          shell: false,
        },
      );
      const t = setTimeout(() => c.kill(), 10000);
      c.once("error", () => {});
      c.once("close", (code) => {
        clearTimeout(t);
        code === 0 ? ok() : no(Error("Private file ACL rejected"));
      });
    });
  } else if (before.mode & 0o077 || before.uid !== process.getuid())
    throw Error("Private file owner/permissions rejected");
  const file = await open(
    path,
    constants.O_RDONLY |
      (process.platform === "win32" ? 0 : constants.O_NOFOLLOW),
  );
  try {
    const after = await file.stat();
    if (
      !after.isFile() ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    )
      throw Error("Private file changed");
    return file;
  } catch (e) {
    await file.close();
    throw e;
  }
}
export async function readPrivateFile(path, options) {
  const file = await privateFile(path, options);
  try {
    return await file.readFile();
  } finally {
    await file.close();
  }
}
