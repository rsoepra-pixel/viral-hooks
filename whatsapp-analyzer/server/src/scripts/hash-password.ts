import { hashPassword } from "../config.js";

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: npm run hash -w server -- "your-strong-password"');
  process.exit(1);
}
console.log("\nAdd this to your .env as APP_PASSWORD_HASH:\n");
console.log(hashPassword(pw));
console.log("");
