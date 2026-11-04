-- One rebuild path (Nov 4, 2026, asked by the owner): the site is rebuilt by the GitHub "Deploy yaynyc.com"
-- workflow every 4 hours, which builds on live data, runs the build gate and only then makes Cloudflare deploy.
-- The database's own twice-daily deploy-hook rebuild (no gate, same effect) is retired. site_rebuild() stays for
-- a manual rebuild by hand.
select cron.unschedule(jobname) from cron.job where jobname in ('yay-rebuild-morning', 'yay-rebuild-evening');
