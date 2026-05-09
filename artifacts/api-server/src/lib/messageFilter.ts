/**
 * Content filter — detects and censors contact information in messages.
 * Blocks: phone numbers (all formats), emails, social handles, links, evasion attempts.
 *
 * CRITICAL FIX: The old regex \b0?4\d[\s.\-]?\d{3}[\s.\-]?\d{4}\b failed for
 * numbers WITHOUT separators (e.g. "04121234567") because \b cannot close on
 * a digit that is followed by more digits. Now uses a catch-all for 9+ digit
 * sequences which covers all phone number lengths.
 */

const PATTERNS: Array<{ regex: RegExp; label: string }> = [

  // ── URLs / Links ────────────────────────────────────────────────────────
  {
    regex: /https?:\/\/(wa\.me|api\.whatsapp\.com|wa\.link|t\.me)[^\s]*/gi,
    label: "[enlace bloqueado]",
  },
  {
    regex: /https?:\/\/(instagram\.com|instagr\.am|fb\.me|facebook\.com|twitter\.com|tiktok\.com|snapchat\.com|telegram\.org)[^\s]*/gi,
    label: "[enlace bloqueado]",
  },

  // ── Email addresses ─────────────────────────────────────────────────────
  {
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    label: "[correo bloqueado]",
  },

  // ── Venezuelan mobile — WITH or WITHOUT any separator ──────────────────
  // Covers: 04121234567 / 0412-123-4567 / 0412 123 4567 / +58 412 1234567
  // Carriers: 04{1,2,4,6} (Movistar/Digitel/Movilnet/etc.)
  {
    regex: /(\+?58[\s.\-]?)?0?4[01256]\d[\s.\-]?\d{3}[\s.\-]?\d{3,4}/g,
    label: "[número bloqueado]",
  },

  // ── Venezuelan landline (02XX-XXXXXXX) ──────────────────────────────────
  { regex: /\b02\d[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g, label: "[número bloqueado]" },

  // ── Catch-all: ANY 9+ consecutive digits = phone number ─────────────────
  // This is the most important rule — catches 04121234567 (11 digits) and
  // any international number typed without separators.
  { regex: /\b\d{9,}\b/g, label: "[número bloqueado]" },

  // ── Groups with dashes/spaces/dots that total 7+ digits ─────────────────
  // e.g. "0412 123 4567" or "412-123-4567"
  { regex: /\b\d{2,4}[\s.\-]\d{3,4}[\s.\-]\d{3,4}\b/g, label: "[número bloqueado]" },

  // ── Spaced individual digits evasion: "0 4 1 2 1 2 3 4 5 6 7" ───────────
  { regex: /(\b\d\s){5,}\d\b/g, label: "[número bloqueado]" },

  // ── Social handles (@mention) ────────────────────────────────────────────
  { regex: /@[a-zA-Z0-9._]{3,}/g, label: "[contacto bloqueado]" },

  // ── Keyword evasion: "mi número es / mi celular: / whatsapp:" ───────────
  {
    regex: /\b(mi\s+)?(n[uú]mero|celular|cel|tel[eé]fono|telf?|telefono|whatsapp|wsp|insta(gram)?|ig|snapchat|correo|email|mail)\s*[:=\s]\s*[a-zA-Z0-9._@+\-\s]{2,40}/gi,
    label: "[contacto bloqueado]",
  },

  // ── "búscame / contáctame / escríbeme en/por..." ────────────────────────
  {
    regex: /\b(b[uú]scame|enc[uú][eé]ntrame|cont[aá]ctame|escr[ií]beme|ll[aá]mame|manda)\s+(me\s+)?(en|por|al?)\s+[a-zA-Z0-9\s@._+\-]{2,40}/gi,
    label: "[contacto bloqueado]",
  },

  // ── "te paso / te mando / te doy mi número / contacto..." ───────────────
  {
    regex: /\b(te\s+)?(paso|mando|doy|comparto)\s+(mi\s+)?(n[uú]mero|celular|tel[eé]fono|contacto|correo|email|whatsapp|insta)[^.!?\n]{0,40}/gi,
    label: "[contacto bloqueado]",
  },
];

export interface FilterResult {
  content: string;
  wasFiltered: boolean;
}

export function filterMessage(raw: string): FilterResult {
  let content = raw;
  let wasFiltered = false;

  for (const { regex, label } of PATTERNS) {
    regex.lastIndex = 0;
    const replaced = content.replace(regex, label);
    if (replaced !== content) {
      wasFiltered = true;
      content = replaced;
    }
  }

  return { content, wasFiltered };
}
