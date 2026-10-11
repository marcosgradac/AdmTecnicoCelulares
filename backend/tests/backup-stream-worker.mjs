import { readFile } from "node:fs/promises";
import { simulatedTLSBackup } from "./helpers/backup-tls-cluster.mjs";
import {
  restoreStreaming,
  verifyStreaming,
} from "../scripts/backup/stream-engine.mjs";
const options = JSON.parse(await readFile(process.argv[3], "utf8")),
  key = await readFile(options.keyFile);
const baseline = process.memoryUsage().rss;
let peak = baseline,
  external = 0,
  heap = 0;
function sample() {
  const m = process.memoryUsage();
  peak = Math.max(peak, m.rss);
  external = Math.max(external, m.external);
  heap = Math.max(heap, m.heapUsed);
}
const timer = setInterval(sample, 10),
  start = performance.now();
try {
  const operation = process.argv[2],
    result =
      operation === "create"
        ? await simulatedTLSBackup({ ...options, key })
        : await (operation === "restore" ? restoreStreaming : verifyStreaming)({
            ...options,
            key,
          });
  sample();
  console.log(
    JSON.stringify({
      result,
      elapsedMs: Math.round(performance.now() - start),
      baselineRSS: baseline,
      peakRSS: Math.max(peak, process.resourceUsage().maxRSS * 1024),
      peakExternal: external,
      peakHeap: heap,
      productionAccess: false,
    }),
  );
} finally {
  clearInterval(timer);
  key.fill(0);
}
