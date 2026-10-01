/**
 * Customers must never see internal failure text (node/space names, token
 * fragments, HTTP codes, stack traces, provider names). Pass any raw error
 * that might reach the UI through this. Messages written for users
 * (insufficient credits, content-policy rejections, our own copy) pass.
 */
const TECHNICAL = /(@|https?:|\.py\b|traceback|exception|errno|econn|etimedout|status code|\bhttp\b|\b[45]\d\d\b|\bnodes?\b|\btoken\b|firestore|firebase|rtdb|undefined|\bnull\b|stack|typeerror|referenceerror|keyerror|valueerror|gradio|\bspace\b|hf\.space|huggingface|vertex|gemini|elevenlabs|11labs|openrouter|api key|permission[_ -]denied|deadline|cluster|config)/i;

export const GENERIC_ERROR = 'Something went wrong. Please try again in a moment.';

export function userFacingError(raw: unknown, fallback: string = GENERIC_ERROR): string {
  const msg = typeof raw === 'string' ? raw.trim() : raw instanceof Error ? raw.message.trim() : '';
  if (!msg) return fallback;
  if (/insufficient credits/i.test(msg)) return msg;
  if (msg.length > 200 || TECHNICAL.test(msg)) return fallback;
  return msg;
}

/**
 * Old ledger entries were written as "<what failed>: <raw error>". Show only
 * the readable head when the tail is technical; normal reasons pass through.
 */
export function cleanLedgerReason(reason: string | null | undefined): string {
  const r = (reason || '').trim();
  const i = r.indexOf(':');
  if (i > 0) {
    const tail = r.slice(i + 1);
    if (tail.length > 120 || TECHNICAL.test(tail)) return r.slice(0, i).trim();
  }
  return r;
}
