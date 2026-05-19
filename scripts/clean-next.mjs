import { rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const nextDir = path.resolve(projectRoot, ".next");
const relativeTarget = path.relative(projectRoot, nextDir);

if (
  relativeTarget.startsWith("..") ||
  path.isAbsolute(relativeTarget) ||
  path.basename(nextDir) !== ".next"
) {
  console.error("Bezpecnostni kontrola zastavila mazani .next cache.");
  process.exit(1);
}

await rm(nextDir, { force: true, recursive: true });
console.log("Vymazana Next.js cache: .next");
