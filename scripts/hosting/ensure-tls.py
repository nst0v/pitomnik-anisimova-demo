#!/usr/bin/env python3
"""Finish this host's certificate after new .ru delegation becomes public."""
import fcntl
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

APP = Path(os.environ.get('NURSERY_APP_ROOT', '/var/www/u3568610/data/apps/sem-ot-anis'))
SHARED = APP / 'shared'
CONFIG = SHARED / 'tls-panel-session.json'
STATUS = SHARED / 'tls-status.json'
MARKER = Path('/var/www/u3568610/data/www/sem-ot-anis.ru/.force-https')
DOMAIN, CERT, IP = 'sem-ot-anis.ru', 'sem-ot-anis.ru_le1', '31.31.196.9'
PANEL = 'https://server262.hosting.reg.ru:1500/ispmgr'
MAX_ATTEMPTS = 5


def scalar(value):
    if isinstance(value, dict):
        return scalar(value.get('$', ''))
    return str(value) if value is not None else ''


def main():
    os.umask(0o077)
    SHARED.mkdir(parents=True, exist_ok=True)
    with (SHARED / 'tls.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        state = json.loads(STATUS.read_text()) if STATUS.exists() else {}
        if state.get('status') == 'complete':
            CONFIG.unlink(missing_ok=True)
            return 0
        secret = ''

        def record(status, message, **values):
            state.update(values, status=status, message=message.replace(secret, '[session]') if secret else message,
                         checked_at=int(time.time()))
            temporary = SHARED / '.tls-status.tmp'
            temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')
            os.replace(temporary, STATUS)
            print(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), state['message'], flush=True)

        def api(function, **values):
            fields = dict(auth=secret, out='json', func=function, **values)
            data = urllib.parse.urlencode(fields).encode()
            with urllib.request.urlopen(urllib.request.Request(PANEL, data=data), timeout=25) as response:
                document = json.loads(response.read(2 * 1024 * 1024)).get('doc', {})
            if document.get('error'):
                error = document['error']
                if isinstance(error, list):
                    error = error[0]
                message = scalar(error.get('msg')) if isinstance(error, dict) else scalar(error)
                raise RuntimeError('Panel API: ' + (message or 'request rejected')[:240])
            return document

        try:
            if not CONFIG.exists():
                record('pending_session', 'Waiting: private panel session is missing.')
                return 0
            secret = json.loads(CONFIG.read_text())['auth']
            if not isinstance(secret, str) or not secret:
                raise ValueError('Invalid private panel session configuration.')
            # This read-only request also keeps an otherwise idle panel session alive.
            document = api('sslcert')
            elements = document.get('elem', [])
            if isinstance(elements, dict):
                elements = [elements]
            certificate = next((row for row in elements if isinstance(row, dict)
                                and CERT in {scalar(row.get('key')), scalar(row.get('name'))}), None)
            try:
                local = {entry[4][0] for entry in socket.getaddrinfo(DOMAIN, 443, type=socket.SOCK_STREAM)}
                url = 'https://dns.google/resolve?' + urllib.parse.urlencode({'name': DOMAIN, 'type': 'A'})
                with urllib.request.urlopen(url, timeout=10) as response:
                    dns = json.loads(response.read(65536))
                public = {row.get('data') for row in dns.get('Answer', []) if row.get('type') == 1}
                ready = IP in local and dns.get('Status') == 0 and IP in public
            except (OSError, ValueError, urllib.error.URLError):
                ready = False
            if not ready:
                record('waiting_dns', 'Waiting: public DNS delegation has not reached this host and Google DNS.')
                return 0
            failed = bool(certificate and scalar(certificate.get('letsencrypt_failed')) == 'on')
            processing = bool(certificate and scalar(certificate.get('letsencrypt_processing')) == 'on')
            if certificate is None or (failed and not processing):
                attempts = int(state.get('attempts', 0))
                cooldown = 86400 if state.get('request_accepted') and not failed else 3600
                if time.time() - int(state.get('last_attempt', 0)) < cooldown:
                    record('waiting_certificate', 'Waiting: certificate request is pending or cooling down.')
                    return 0
                if attempts >= MAX_ATTEMPTS:
                    record('pending_review', 'Waiting: certificate request attempt limit reached; inspect panel certificate log.')
                    return 0
                record('requesting', 'Submitting certificate request.', attempts=attempts + 1,
                       last_attempt=int(time.time()), request_accepted=True)
                api('letsencrypt.generate', sok='ok', domain_name=DOMAIN, domain_type='web',
                    domain=DOMAIN + ' www.' + DOMAIN, crtname=CERT, email='webmaster@' + DOMAIN,
                    enable_cert='on', enable_cert_email='off', dns_check='off', skip_check_a_record='on',
                    keylen='2048', wildcard='off')
                record('waiting_certificate', 'Waiting: certificate request accepted; panel manages validation retries.',
                       request_accepted=True)
                return 0

            def trusted(path):
                result = subprocess.run(['curl', '--silent', '--show-error', '--fail', '--connect-timeout', '5',
                                         '--max-time', '20', '--write-out', '\n%{http_code}', 'https://' + DOMAIN + path],
                                        capture_output=True, check=False)
                if result.returncode != 0:
                    raise RuntimeError('Waiting: trusted HTTPS is not ready on ' + path)
                body, _, status = result.stdout.rpartition(b'\n')
                if status != b'200':
                    raise RuntimeError('Waiting: HTTPS status is not 200 on ' + path)
                return body

            session = json.loads(trusted('/api/admin/session'))
            content = json.loads(trusted('/site-content.json'))
            page = trusted('/')
            if session.get('authenticated') is not False or not all(isinstance(content.get(key), list)
                    for key in ['products', 'articles', 'hiddenArticles']) or b'<html' not in page.lower():
                raise RuntimeError('Waiting: HTTPS application health check failed.')
            created = not MARKER.exists()
            MARKER.touch(mode=0o600, exist_ok=True)
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, req, fp, code, msg, headers, newurl):
                    return None
            try:
                try:
                    with urllib.request.build_opener(NoRedirect()).open('http://' + DOMAIN + '/', timeout=15) as response:
                        redirect_status, location = response.status, response.headers.get('Location', '')
                except urllib.error.HTTPError as response:
                    redirect_status, location = response.code, response.headers.get('Location', '')
                if redirect_status != 301 or location != 'https://' + DOMAIN + '/':
                    raise RuntimeError('Waiting: HTTP-to-HTTPS redirect verification failed.')
            except Exception:
                if created:
                    MARKER.unlink(missing_ok=True)
                raise
            record('complete', 'TLS complete: trusted HTTPS and HTTP redirect verified.', completed_at=int(time.time()))
            CONFIG.unlink(missing_ok=True)
        except Exception as error:
            # No response payload, request URL, token or account password is logged.
            if isinstance(error, RuntimeError) and str(error).startswith('Panel API:'):
                state['request_accepted'] = False
            record('pending', type(error).__name__ + ': ' + str(error)[:240])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
