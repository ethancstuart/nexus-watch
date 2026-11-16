/**
 * Synthetic publication ids for the beehiiv tests — never a real value.
 *
 * The malformed ones are chosen so that no four-character run of them can
 * occur in ordinary alert prose, which lets `leaks` prove "no fragment of the
 * value appears" instead of assuming it from one substring check.
 */
export const GOOD = 'pub_00000000-1111-2222-3333-444444444444';
export const GOOD_OTHER = 'pub_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
/** 32 characters, no pub_ prefix. */
export const BAD = 'Qk7Xv-9mZp-W3tR-Lc8Yd-NbHs4-Ugj2';
/** 25 characters, has the pub_ prefix, but is not hex. */
export const BAD_WITH_PREFIX = 'pub_Qk7Xv-9mZp-W3tR-Lc8Yd';

/** True when any 4-character run of `value` (other than "pub_") appears in `text`. */
export function leaks(value: string, text: string): boolean {
  for (let i = 0; i + 4 <= value.length; i++) {
    const gram = value.slice(i, i + 4);
    if (gram === 'pub_') continue;
    if (text.includes(gram)) return true;
  }
  return false;
}
