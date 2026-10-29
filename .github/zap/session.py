"""Signs in to a local test stack for the authenticated ZAP scans.

  session.py setup <setup token>   first run: creates the admin (with two-step verification,
                                   so admin routes can be scanned too)
  session.py login <email> <password>

Prints shell lines for $GITHUB_ENV: ZAP_COOKIE (the session cookie) and ZAP_ORG (an
organization id). Standard library only; for a local test stack with a self-signed
certificate (certificate checks are off), never for a real server.
"""

import base64
import hashlib
import hmac
import json
import ssl
import struct
import sys
import time
import urllib.request

BASE = "https://localhost"
CONTEXT = ssl.create_default_context()
CONTEXT.check_hostname = False
CONTEXT.verify_mode = ssl.CERT_NONE

cookie = ""
# A throwaway account on a throwaway stack.
PASSWORD = "scanning all the routes slowly"


def call(method, path, body=None):
    global cookie
    data = None if method == "GET" else json.dumps(body or {}).encode()
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("content-type", "application/json")
    if cookie:
        request.add_header("cookie", cookie)
    with urllib.request.urlopen(request, context=CONTEXT) as response:
        for header in response.headers.get_all("set-cookie") or []:
            pair = header.split(";", 1)[0]
            if "rubinny_session=" in pair and pair.split("=", 1)[1]:
                cookie = pair
        text = response.read().decode()
        return json.loads(text) if text else {}


def totp(secret_b32):
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8))
    digest = hmac.new(key, struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    return f"{(struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


mode = sys.argv[1]
if mode == "setup":
    call(
        "POST",
        "/api/v1/setup",
        {
            "setupToken": sys.argv[2],
            "email": "scanner@example.com",
            "password": PASSWORD,
            "name": "ZAP scanner",
            "orgName": "Scan",
            "locale": "en",
        },
    )
    secret = call("POST", "/api/v1/auth/mfa/totp/setup", {"password": PASSWORD})["secret"]
    call("POST", "/api/v1/auth/mfa/totp/enable", {"code": totp(secret)})
elif mode == "login":
    call("POST", "/api/v1/auth/login", {"email": sys.argv[2], "password": sys.argv[3]})
else:
    sys.exit(__doc__)

session = call("GET", "/api/v1/auth/session")
if not cookie or not session.get("memberships"):
    sys.exit("No session or no organization")
print(f"ZAP_COOKIE={cookie}")
print(f"ZAP_ORG={session['memberships'][0]['orgId']}")
