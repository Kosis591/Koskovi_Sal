import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const password = process.argv[2] ?? (await askPassword());

if (!password) {
  console.error("Zadej heslo jako argument nebo po vyzve.");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const key = scryptSync(password, salt, 64).toString("hex");

console.log(`scrypt$${salt}$${key}`);

async function askPassword() {
  const readline = createInterface({ input, output });
  const value = await readline.question("Heslo k zahashovani: ");
  readline.close();

  return value;
}
