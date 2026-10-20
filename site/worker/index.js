// One job: send http:// requests to https:// with a permanent redirect, so Google keeps one
// version of each page (Search Console showed 113 pages indexed under http:// on Oct 19, 2026).
// Everything else is served from the static assets exactly as before.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === 'http:' && url.hostname === 'yaynyc.com') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
