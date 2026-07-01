import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseChat } from "@wa-analyzer/core";
import { Store } from "../dist/db.js";
import { runSearch, type ClassifyFn } from "../dist/pipeline.js";
import type { Config } from "../dist/config.js";

function tmpStore(): { store: Store; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "wa-test-"));
  return { store: new Store(dir), dir };
}

const cfg: Config = {
  port: 0,
  sessionSecret: "x",
  passwordHash: null,
  anthropicKey: "test-key",
  model: "test",
  redact: true,
  dataDir: ".",
  retentionDays: 0,
  isProd: false,
};

const RAW = [
  "18/07/23 20.14 - Budi: yuk main slot gacor maxwin, transfer ke +62 812-3456-7890",
  "18/07/23 20.15 - Siti: ga ah",
  "18/07/23 20.16 - Budi: makan siang yuk besok",
].join("\n");

test("end-to-end: prefilter -> mocked classify -> finding with de-redacted context", async () => {
  const { store, dir } = tmpStore();
  try {
    const chat = parseChat(RAW, { dayFirst: true, title: "Budi" });
    store.addChat("c1", chat.title, chat.isGroup, chat.participants, chat.messages);

    // Mock classifier: confirm the first candidate as gambling, and assert the
    // text handed to the LLM was redacted (no raw phone / name leaked).
    let sawRedacted = false;
    const mockClassify: ClassifyFn = async (_cands, _p, redact, map) => {
      assert.ok(redact, "redaction should be on");
      // The pipeline pre-registers participant names; NAME tokens must exist so
      // the real classifier would send redacted text to the cloud.
      sawRedacted = [...map.restore.keys()].some((t) => /\[NAME/.test(t));
      return [
        {
          index: 0,
          patternId: "gambling",
          isMatch: true,
          confidence: 0.9,
          rationale: "Ajakan main slot gacor.",
          highlights: ["slot gacor", "maxwin"],
        },
      ];
    };

    const res = await runSearch(store, cfg, {
      patternIds: [],
      chatIds: [],
      minConfidence: 0.5,
    }, { classify: mockClassify });

    assert.equal(res.findings.length, 1);
    const f = res.findings[0];
    assert.equal(f.patternId, "gambling");
    assert.equal(f.confidence, 0.9);
    // Report context must be DE-redacted (original phone visible locally)
    assert.match(f.context.map((m) => m.text).join(" "), /812-3456-7890/);
    assert.equal(f.senderNumber, null); // sender is a name, not a bare number
    assert.equal(f.signature, "c1:0:gambling");
    assert.ok(sawRedacted, "phone/name should have been tokenized before LLM");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("false-positive feedback suppresses a finding", async () => {
  const { store, dir } = tmpStore();
  try {
    const chat = parseChat(RAW, { dayFirst: true, title: "Budi" });
    store.addChat("c1", chat.title, chat.isGroup, chat.participants, chat.messages);
    store.addFeedback("c1:0:gambling");

    const mock: ClassifyFn = async () => [
      { index: 0, patternId: "gambling", isMatch: true, confidence: 0.9, rationale: "x", highlights: [] },
    ];
    const res = await runSearch(store, cfg, { patternIds: [], chatIds: [], minConfidence: 0.5 }, { classify: mock });
    assert.equal(res.findings.length, 0, "dismissed signature should be filtered out");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("minConfidence filters low-confidence verdicts", async () => {
  const { store, dir } = tmpStore();
  try {
    const chat = parseChat(RAW, { dayFirst: true, title: "Budi" });
    store.addChat("c1", chat.title, chat.isGroup, chat.participants, chat.messages);
    const mock: ClassifyFn = async () => [
      { index: 0, patternId: "gambling", isMatch: true, confidence: 0.3, rationale: "weak", highlights: [] },
    ];
    const res = await runSearch(store, cfg, { patternIds: [], chatIds: [], minConfidence: 0.5 }, { classify: mock });
    assert.equal(res.findings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
