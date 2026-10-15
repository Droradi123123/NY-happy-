/**
 * Site-wide settings that are not secrets (they all end up in public HTML anyway).
 * Search Console / Bing verification codes go here once the properties are created;
 * an empty string means the tag is not printed.
 */
/** Google Analytics 4 measurement ID (property "YaY NYC"); PUBLIC_GA_ID at build time overrides it */
export const GA_MEASUREMENT_ID = 'G-4SVKQNG36B';
export const GOOGLE_SITE_VERIFICATION = '';
export const BING_SITE_VERIFICATION = '';
/** IndexNow (Bing, Yandex, Seznam...): the key is public by design and served at /<key>.txt */
export const INDEXNOW_KEY = '71833f93db0dd3c44f0a3e6f2ced42e7';
