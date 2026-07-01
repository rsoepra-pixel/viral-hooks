import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseChat,
  prefilter,
  createRedactionMap,
  registerNames,
  redactText,
  restoreText,
} from "../dist/index.js";

test("prefilter surfaces gambling + pinjol candidates", () => {
  const raw = [
    "18/07/23 20.14 - Budi: yuk main slot gacor maxwin di situs ini",
    "18/07/23 20.15 - Siti: pinjaman online cair cepat tanpa jaminan",
    "18/07/23 20.16 - Budi: makan siang yuk",
  ].join("\n");
  const chat = parseChat(raw);
  const cands = prefilter("c1", chat.messages);
  const patterns = new Set(cands.flatMap((c) => c.matchedPatterns));
  assert.ok(patterns.has("gambling"));
  assert.ok(patterns.has("loan"));
  // benign line not matched
  assert.equal(cands.find((c) => c.message.text.includes("makan siang")), undefined);
});

test("redaction tokenizes and restores phone + names", () => {
  const map = createRedactionMap();
  registerNames(map, ["Budi", "Siti"]);
  const original = "Budi transfer ke +62 812-3456-7890 ya, bilang ke Siti";
  const red = redactText(map, original);
  assert.ok(!red.includes("Budi"));
  assert.ok(!red.includes("812-3456-7890"));
  assert.ok(red.includes("[NAME_1]"));
  assert.ok(/\[PHONE_\d\]/.test(red));
  assert.equal(restoreText(map, red), original);
});
