import type { Message, ParsedChat } from "./types.js";

/**
 * WhatsApp "Export chat" .txt parser.
 *
 * Handles the common Android and iOS export layouts, including the
 * Indonesian locale which uses day-first dates and a "." time separator:
 *
 *   Android : 18/07/23 20.14 - Budi: halo
 *             18/07/2023, 20.14 - Budi: halo
 *   iOS     : [18/07/23 20.14.30] Budi: halo
 *   12h     : 7/18/23, 8:14 PM - Budi: hello
 *
 * Lines that don't start with a timestamp are treated as continuations of
 * the previous message. Lines with a timestamp but no "Name: " part are
 * treated as system notices (encryption notice, joins/leaves, etc.).
 */

export interface ParseOptions {
  /** Interpret ambiguous dates as day/month/year (Indonesia default). */
  dayFirst?: boolean;
  /** Title to attach to the chat (e.g. derived from filename). */
  title?: string | null;
}

// Android: optional iOS-style leading bracket handled separately below.
const ANDROID_RE =
  /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,]?\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?(?:\s?([APap][Mm]))?\s+-\s+([\s\S]*)$/;

const IOS_RE =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,]?\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?(?:\s?([APap][Mm]))?\]\s*([\s\S]*)$/;

// Sender/message split: "Name: message". Name shouldn't contain a newline and
// is kept reasonably short to avoid mis-splitting sentences that contain ": ".
const SENDER_RE = /^([^:\n]{1,80}?):\s([\s\S]*)$/;

function toEpoch(
  d: number,
  m: number,
  y: number,
  hh: number,
  mm: number,
  ss: number,
  ampm: string | undefined,
  dayFirst: boolean
): number {
  let day = d;
  let month = m;
  // If not day-first, or the "day" value is impossible as a day, swap.
  if (!dayFirst) {
    day = m;
    month = d;
  }
  if (day > 31 && month <= 31) {
    // clearly swapped
    const t = day;
    day = month;
    month = t;
  }
  let year = y;
  if (year < 100) year += 2000;

  let hours = hh;
  if (ampm) {
    const isPm = /pm/i.test(ampm);
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
  }
  // Local time. Note: exports carry no timezone; treated as host-local.
  return new Date(year, month - 1, day, hours, mm, ss).getTime();
}

function matchHeader(
  line: string
): { rest: string; ts: number } | null {
  // Try iOS bracket format first, then Android.
  let m = IOS_RE.exec(line);
  let isIos = true;
  if (!m) {
    m = ANDROID_RE.exec(line);
    isIos = false;
  }
  if (!m) return null;
  const [, dd, mm, yy, HH, MM, SS, ap, rest] = m;
  const ts = toEpoch(
    Number(dd),
    Number(mm),
    Number(yy),
    Number(HH),
    Number(MM),
    SS ? Number(SS) : 0,
    ap,
    true // caller may override via parseChat dayFirst; header regex is locale-agnostic
  );
  void isIos;
  return { rest, ts };
}

/** Strip invisible LTR/RTL marks WhatsApp injects around timestamps. */
function clean(line: string): string {
  return line.replace(/[‎‏‪-‮ ]/g, "").replace(/\r$/, "");
}

export function parseChat(raw: string, opts: ParseOptions = {}): ParsedChat {
  const dayFirst = opts.dayFirst ?? true;
  const lines = raw.split("\n");
  const messages: Message[] = [];
  const participants = new Set<string>();
  let hasGroupNotice = false;

  const pushLine = (rawLine: string) => {
    const line = clean(rawLine);
    if (line === "") {
      // blank line: append to current message if any
      if (messages.length) messages[messages.length - 1].text += "\n";
      return;
    }
    // Re-run header match but honoring dayFirst for date interpretation.
    let header = matchHeader(line);
    if (header) {
      // Recompute epoch respecting dayFirst using the raw regex groups.
      const m = IOS_RE.exec(line) ?? ANDROID_RE.exec(line);
      if (m) {
        const [, dd, mm, yy, HH, MM, SS, ap, rest] = m;
        const ts = toEpoch(
          Number(dd),
          Number(mm),
          Number(yy),
          Number(HH),
          Number(MM),
          SS ? Number(SS) : 0,
          ap,
          dayFirst
        );
        header = { rest, ts };
      }
    }

    if (!header) {
      // continuation line
      if (messages.length) {
        messages[messages.length - 1].text +=
          (messages[messages.length - 1].text ? "\n" : "") + line;
      }
      return;
    }

    const sm = SENDER_RE.exec(header.rest);
    if (sm) {
      const sender = sm[1].trim();
      const text = sm[2];
      participants.add(sender);
      messages.push({
        seq: messages.length,
        timestamp: header.ts,
        sender,
        text,
        system: false,
      });
    } else {
      // system notice
      if (/added|left|removed|created group|changed the subject|joined|end-to-end encrypted/i.test(header.rest)) {
        hasGroupNotice = true;
      }
      messages.push({
        seq: messages.length,
        timestamp: header.ts,
        sender: null,
        text: header.rest,
        system: true,
      });
    }
  };

  for (const l of lines) pushLine(l);

  const parts = [...participants];
  return {
    title: opts.title ?? null,
    isGroup: hasGroupNotice || parts.length > 2,
    messages,
    participants: parts,
  };
}
