#!/usr/bin/env node
/** Atomic write helpers for offline fixture / taxonomy scripts. */
import fs from "node:fs";
import path from "node:path";

export function writeAtomicSync(dest, contents) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, contents, typeof contents === "string" ? "utf8" : undefined);
  fs.renameSync(tmp, dest);
}

export function writeJsonAtomicSync(dest, data, space = 2) {
  writeAtomicSync(dest, `${JSON.stringify(data, null, space)}\n`);
}
