/** Lowercases and strips accents so comparisons ignore case and diacritics. */
export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
