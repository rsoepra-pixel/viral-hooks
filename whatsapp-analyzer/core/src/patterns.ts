import type { PatternDef } from "./types.js";

/**
 * Built-in risk patterns with Indonesian + English lexicons.
 *
 * The keyword lists power the cheap, local, deterministic PREFILTER only — they
 * narrow millions of messages down to candidates. The final decision is made by
 * the LLM using each pattern's `rubric`. Keywords are intentionally broad
 * (high recall); false positives are pruned by the model.
 *
 * Lexicons are editable — tune them for your own chats.
 */
export const PATTERNS: PatternDef[] = [
  {
    id: "scam",
    label: "Possible scam (penipuan)",
    description: "Fraud, impersonation, phishing, prize/advance-fee scams.",
    keywords: [
      "penipuan", "penipu", "tipu", "hadiah", "pemenang", "menang", "undian",
      "selamat anda", "kode otp", "otp", "verifikasi", "klik link", "klik tautan",
      "transfer sekarang", "admin bank", "customer service", "rekening", "saldo",
      "kartu kredit", "diblokir", "segera", "mendesak", "gratis",
      "winner", "congratulations", "verify", "urgent", "click here", "prize",
    ],
    regexes: ["https?:\\/\\/\\S+", "\\bwa\\.me\\/\\S+", "bit\\.ly\\/\\S+"],
    rubric:
      "Flag messages that try to defraud the reader: fake prizes/lotteries, impersonation of banks/officials/family, phishing links, requests for OTP/passwords, advance-fee ('pay a small fee to receive X'), or urgent pressure to transfer money.",
  },
  {
    id: "threat",
    label: "Possible threat (ancaman)",
    description: "Intimidation, coercion, blackmail, threats of harm.",
    keywords: [
      "ancam", "ancaman", "awas kamu", "awas ya", "bunuh", "habisi", "sebar",
      "sebarkan", "bongkar", "laporin", "gua tau alamat", "tau alamat lo",
      "jangan macam-macam", "atau kamu", "kalau tidak", "hati-hati kamu",
      "threat", "kill you", "expose you", "i know where you live", "or else",
    ],
    rubric:
      "Flag messages that intimidate or coerce: threats of physical harm, blackmail/extortion ('do X or I will reveal Y'), threats to leak private data/photos, or menacing pressure.",
  },
  {
    id: "gambling",
    label: "Possible online gambling (judi online)",
    description: "Betting/slot sites, lottery, gambling promotion.",
    keywords: [
      "judi", "judol", "slot", "gacor", "maxwin", "scatter", "jackpot",
      "situs slot", "bandar", "togel", "toto", "taruhan", "pasang angka",
      "deposit", "wd", "withdraw", "rtp", "link slot", "daftar sekarang",
      "bet", "casino", "betting", "gambling",
    ],
    rubric:
      "Flag promotion of or participation in online gambling: slot/casino/togel sites, betting invitations, deposit/withdraw (wd) slang, 'gacor/maxwin/rtp' terms, referral links to gambling platforms.",
  },
  {
    id: "loan",
    label: "Possible online borrowing / illegal lending (pinjol)",
    description: "Predatory loan apps, illegal lenders, debt collection pressure.",
    keywords: [
      "pinjol", "pinjaman online", "pinjaman", "dana cair", "cair cepat",
      "tanpa jaminan", "tanpa agunan", "bunga rendah", "bunga", "tenor",
      "cicilan", "limit", "gadai", "rentenir", "dc", "debt collector",
      "sebar kontak", "ancaman dc", "galbay", "gagal bayar",
      "loan", "instant cash", "no collateral", "interest rate",
    ],
    rubric:
      "Flag illegal/predatory online lending (pinjol): offers of instant cash without collateral, aggressive debt-collection, threats to spread the borrower's contacts, usurious interest, or pressure tactics around 'galbay/gagal bayar'.",
  },
  {
    id: "theft",
    label: "Possible theft (pencurian)",
    description: "Stolen goods, account takeover, unauthorized access.",
    keywords: [
      "curi", "mencuri", "maling", "colong", "rampok", "barang curian",
      "barang hilang", "hasil curian", "bobol", "jebol", "akun dibajak",
      "hack akun", "ambil diam-diam", "gelap",
      "stolen", "steal", "hacked", "break in",
    ],
    rubric:
      "Flag discussion of theft: selling/buying stolen goods, planning to steal, account/device takeover, unauthorized access, or admitting to taking something without permission.",
  },
  {
    id: "malicious_intent",
    label: "Possible malicious intent (niat jahat)",
    description: "Planning harm, fraud, or wrongdoing against someone.",
    keywords: [
      "rencana", "kita jebak", "jebak", "tipu dia", "kerjain dia", "balas dendam",
      "rugikan", "sakiti", "celakai", "hancurkan", "sabotase",
      "scheme", "set him up", "revenge", "sabotage", "hurt them",
    ],
    rubric:
      "Flag messages revealing intent to harm, defraud, entrap, or sabotage a specific person or group — planning wrongdoing, coordinating deception, or expressing a concrete harmful plan.",
  },
  {
    id: "romance_scam",
    label: "Possible malicious romance (love scam)",
    description: "Romance manipulation escalating to requests for money/gifts.",
    keywords: [
      "sayang", "cinta", "beb", "honey", "my love", "rindu", "percaya aku",
      "kirim uang", "butuh uang", "pinjam dulu", "tiket pesawat", "biaya rumah sakit",
      "bea cukai", "paket tertahan", "kirim pulsa", "voucher", "gift card",
      "i love you", "trust me", "send money", "hospital bill", "customs fee",
    ],
    rubric:
      "Flag romance scams: fast-moving affection/love-bombing from someone (often not met in person) that escalates into requests for money, gift cards, phone credit, travel/medical/customs fees, or 'help me and I'll pay you back'.",
  },
  {
    id: "pig_butchering",
    label: "Possible pig butchering (investasi bodong)",
    description: "Long-con romance + fake crypto/investment platform.",
    keywords: [
      "investasi", "investasi bodong", "crypto", "kripto", "trading", "profit",
      "keuntungan", "cuan", "modal", "platform", "aplikasi trading", "usdt",
      "bitcoin", "forex", "robot trading", "sinyal", "guru trading",
      "pasti untung", "profit harian", "withdraw untung", "top up",
      "investment", "guaranteed profit", "daily profit", "deposit more",
    ],
    rubric:
      "Flag pig-butchering scams: a trusted/romantic contact steadily introduces a crypto/forex/investment 'opportunity' or platform, shows fake profits, and pressures the reader to deposit ever-larger amounts. Distinguish from generic investment talk by the grooming + pressure-to-deposit pattern.",
  },
];

export const PATTERN_MAP: Map<string, PatternDef> = new Map(
  PATTERNS.map((p) => [p.id, p])
);
