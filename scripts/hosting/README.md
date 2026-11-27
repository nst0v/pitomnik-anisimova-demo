# REG.RU shared hosting

The production site uses the hosting provider's PHP 8.3 FastCGI handler for the
admin API. Node.js is needed only for the frontend build and local development.
The API matches the Node development backend: password login, HttpOnly/Secure/
SameSite cookies, eight-hour sessions, CSRF and origin checks, login throttling,
product/article editing and atomic content persistence. No background application
process is required on the shared hosting account.

Private application root: `/var/www/u3568610/data/apps/sem-ot-anis`.
`current` selects a release containing `dist`, `server`, `src/data` and these
scripts. Build tooling is in `runtime/node/bin`; to rebuild on the host:

```sh
export PATH=/var/www/u3568610/data/apps/sem-ot-anis/runtime/node/bin:$PATH
cd /var/www/u3568610/data/apps/sem-ot-anis/current
npm ci --no-fund --no-audit
npm run typecheck
npm run test:audit
npm run test:admin
npm run test:hosting
npm run build
```

The document root `/var/www/u3568610/data/www/sem-ot-anis.ru` contains the `dist`
files plus `hosting-bridge.php` and `.htaccess`. **Remove `site-content.json` from
the document root**: its URL must reach the live PHP handler, even if nginx serves
existing JSON files directly. Publish a complete staging directory atomically.
`dist/admin/index.html` supplies the proper asset base for `/admin/`.

The public entrypoint loads `php-auth.php` and `php-content.php` from the private
release. Never copy these private files, `src`, configuration, sessions, logs or
backups into the web root. Private configuration is `shared/php-config.json`:

```json
{"password_hash":"bcrypt-hash-created-by-password_hash","secure_cookies":true}
```

Create the hash with PHP `password_hash($password, PASSWORD_BCRYPT, ['cost'=>12])`.
Keep this configuration mode `600` and private directories mode `700`. The
password and its hash are absent from the frontend bundle. Persistent overrides
are in `shared/content/content.json`; the imported 212 products and 41 article
summaries remain in `src/data`, and original article bodies/downloads in `dist`.
Native sessions and login attempt counters remain outside the public directory.
Preserve all of `shared` during updates; a normal deployment needs no restart.

Preserve existing crontab entries and add these health and backup jobs:

```cron
* * * * * /usr/bin/curl --fail --silent --show-error --location --max-time 30 --resolve sem-ot-anis.ru:80:31.31.196.9 --resolve sem-ot-anis.ru:443:31.31.196.9 --output /dev/null http://sem-ot-anis.ru/api/admin/session
23 3 * * * /var/www/u3568610/data/apps/sem-ot-anis/current/scripts/hosting/backup.sh
```

Cron uses the server's Moscow timezone. Redirect job output to private log files.
Backups include content and private configuration, use mode `600` and expire
after 30 days. Sessions and temporary panel tokens are excluded. Keep an
independent copy outside the server for recovery. `NURSERY_APP_ROOT` overrides
the private root for isolated verification; HTTP input never controls it.

For validation, lint PHP files and shell scripts, then check the actual virtual
host: all assets/downloads, responsive catalog/articles, admin login/logout,
authenticated product/article saves, persistence between requests, rejection of
anonymous/CSRF/cross-origin writes, private file protection and a readable backup.
The Node backend's tests still cover the local development server; the PHP
production implementation needs its own HTTP integration checks.

For a newly registered domain, `ensure-tls.py` finishes HTTPS after public DNS
resolves. It requires Python 3.8+; this host provides
`/opt/python/python-3.12/bin/python`. A temporary authenticated panel session goes
in private `shared/tls-panel-session.json`, mode `600`, as
`{"auth":"session-id"}`. No hosting account password is stored. Run every five
minutes until `shared/tls-status.json` reports `complete`. It checks public DNS,
requests the panel-managed Let's Encrypt certificate, verifies trusted HTTPS,
and creates `.force-https` in the document root to enable HTTP redirection.
Successful completion deletes the temporary session. ISPmanager handles renewal.
A panel session error requires replacing the expired private session. Keep all
TLS logs and status files outside the web root.
