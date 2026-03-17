"""TLS-impersonating fetch via curl_cffi. Called by subscope as subprocess.
Usage: python cffi_fetch.py <url> [impersonate] [header:value | @cookie=value ...]
Outputs response body to stdout. Exits 1 on failure."""

import sys
from curl_cffi import requests

url = sys.argv[1]
imp = sys.argv[2] if len(sys.argv) > 2 else 'safari17_0'

# Extra headers/cookies from args
headers = {}
cookies = {}
for arg in sys.argv[3:]:
    if arg.startswith('@') and '=' in arg:
        k, v = arg[1:].split('=', 1)
        cookies[k.strip()] = v.strip()
    elif ':' in arg:
        k, v = arg.split(':', 1)
        headers[k.strip()] = v.strip()

targets = [imp] if imp != 'auto' else ['chrome142', 'safari184', 'chrome133a', 'safari18_0', 'firefox144', 'safari17_0']

for t in targets:
    try:
        r = requests.get(url, impersonate=t, timeout=15, headers=headers or None,
                         cookies=cookies or None, verify=False)
        if r.status_code == 200 and len(r.text) > 100:
            sys.stdout.write(r.text)
            sys.exit(0)
    except Exception:
        continue

sys.stderr.write(f'all impersonations failed for {url}')
sys.exit(1)
