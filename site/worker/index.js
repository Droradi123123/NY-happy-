// Permanent redirects to the one version of each page Google should keep: http:// to https://
// (Search Console showed 113 pages indexed under http:// on Oct 19, 2026), and a trailing slash to the
// page without one (the static assets answer that with a temporary 307, Oct 29).
// Everything else is served from the static assets exactly as before.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'yaynyc.com' && (url.protocol === 'http:' || (url.pathname.length > 1 && url.pathname.endsWith('/')))) {
      url.protocol = 'https:';
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
