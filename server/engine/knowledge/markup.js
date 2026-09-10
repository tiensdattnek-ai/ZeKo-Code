/**
 * Helpers dựng markdown cho knowledge shards.
 * F(lang, filename, code) → fenced code block (```lang:filename)
 * I(code)                 → inline code
 */
export const F = (lang, filename, code) =>
  '\n```' + lang + (filename ? ':' + filename : '') + '\n' + code + '\n```\n';

export const I = (s) => '`' + s + '`';
