import crypto from 'crypto';

/**
 * Lowercases, drops a "+tag", and for Gmail also drops dots — so
 * "A.B+promo@gmail.com" and "ab@gmail.com" (the same inbox) normalize to
 * the same value and can't be used to re-claim signup credits.
 */
export function normalizeEmail(email: string): string {
    const e = (email || '').trim().toLowerCase();
    const at = e.lastIndexOf('@');
    if (at <= 0) return e;
    let local = e.slice(0, at).split('+')[0];
    let domain = e.slice(at + 1);
    if (domain === 'googlemail.com') domain = 'gmail.com';
    if (domain === 'gmail.com') local = local.replace(/\./g, '');
    return `${local}@${domain}`;
}

/**
 * One-way hash of a normalized email, used only for anti-abuse (remembering
 * that an email already had its free signup credits after the account was
 * deleted). The email itself can't be recovered from it. The key is a fixed
 * constant on purpose: it must never change, or every stored hash stops
 * matching.
 */
export function hashEmailForAbuseCheck(email: string): string {
    return crypto.createHmac('sha256', '12labs-deleted-account-v1').update(normalizeEmail(email)).digest('hex');
}
