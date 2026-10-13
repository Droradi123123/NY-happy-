import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://yaynyc.com',
  // URL contract from day one: no trailing slash, /bars/x is dist/bars/x.html.
  // Never change a published URL (PLAN.md section 4).
  trailingSlash: 'never',
  build: { format: 'file' },
  compressHTML: true,
});
