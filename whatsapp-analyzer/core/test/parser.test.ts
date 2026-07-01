import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChat } from "../dist/index.js";

test("parses Indonesian Android format (day-first, dot time)", () => {
  const raw = [
    "18/07/23 20.14 - Budi: halo semua",
    "18/07/23 20.15 - Siti: hai budi",
    "ini baris lanjutan",
    "18/07/23 20.16 - Budi: oke",
  ].join("\n");
  const chat = parseChat(raw, { dayFirst: true });
  assert.equal(chat.messages.length, 3);
  assert.equal(chat.messages[0].sender, "Budi");
  assert.equal(chat.messages[0].text, "halo semua");
  // continuation appended
  assert.match(chat.messages[1].text, /hai budi\nini baris lanjutan/);
  const d = new Date(chat.messages[0].timestamp);
  assert.equal(d.getDate(), 18);
  assert.equal(d.getMonth(), 6); // July
});

test("parses iOS bracket format", () => {
  const raw = "[18/07/23 20.14.30] Budi: pesan ios";
  const chat = parseChat(raw, { dayFirst: true });
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].sender, "Budi");
  assert.equal(chat.messages[0].text, "pesan ios");
});

test("parses 12-hour US format with AM/PM", () => {
  const raw = "7/18/23, 8:14 PM - Alice: hello";
  const chat = parseChat(raw, { dayFirst: false });
  const d = new Date(chat.messages[0].timestamp);
  assert.equal(d.getHours(), 20);
  assert.equal(chat.messages[0].sender, "Alice");
});

test("classifies system notices", () => {
  const raw = "18/07/23 20.14 - Messages and calls are end-to-end encrypted.";
  const chat = parseChat(raw);
  assert.equal(chat.messages[0].system, true);
  assert.equal(chat.messages[0].sender, null);
});

test("detects group via participant count", () => {
  const raw = [
    "18/07/23 20.14 - A: hi",
    "18/07/23 20.15 - B: yo",
    "18/07/23 20.16 - C: hey",
  ].join("\n");
  const chat = parseChat(raw);
  assert.equal(chat.isGroup, true);
  assert.equal(chat.participants.length, 3);
});
