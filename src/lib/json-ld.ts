/**
 * JSON for an inline <script type="application/ld+json">. JSON.stringify
 * leaves "<" as-is, so a value like "</script><script>..." (e.g. a seller's
 * product title) would close the tag and run as HTML. Escaping <, >, & and
 * the JS line separators keeps the JSON identical once parsed.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
