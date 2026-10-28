# Integrations: API keys and webhooks

Other systems can talk to Rubinny without the dashboard: a fire panel or building management
system starts an emergency alert, a queue or register system updates a text on the screens, a
monitoring system checks which screens are connected. And Rubinny can tell them what happened
through **webhooks** (to Teams, Slack, n8n, Zapier or your own code).

Admins manage both under **Integrations** in the dashboard
([plan and design](phases/19-integrations-api-webhooks.md)).

> **Safety.** On-screen alerts add to a certified alarm system; they never replace it. Check
> any integration with a fire alarm or safety system with a safety consultant before relying
> on it.

## API keys

- An admin creates a key with a name and only the **permissions** it needs. The key starts
  with `rbk_` and is shown **once**. Store it like a password (in a secrets manager, not in
  code).
- Rubinny stores only a hash of the key. The list shows its first characters, when it was last
  used and from which network (shortened to /24 or /48).
- **Revoke** a key at any time: it stops working at once. Keys can also expire (30, 90 or 365
  days).

| Permission      | Allows                                                  |
| --------------- | ------------------------------------------------------- |
| `screens:read`  | `GET /api/integrations/v1/screens`                      |
| `alerts:write`  | Start, list and end emergency alerts                    |
| `widgets:write` | Change the text of **text** and **ticker** widgets only |

Send the key in the `Authorization` header. All requests and answers are JSON; errors look like
`{"error":{"code":"…","message":"…"}}`.

| Status | Meaning                                                                     |
| ------ | --------------------------------------------------------------------------- |
| 401    | Missing, unknown, expired or revoked key                                    |
| 403    | The key does not have the permission for this request                       |
| 404    | Not found, or not your organization's (the API does not say which)          |
| 409    | Conflict: the alert already ended, or content changes need approval (below) |
| 429    | Too many requests: 300 a minute per key (and failed key checks per address) |

### Screens

```bash
curl -s https://signage.example.org/api/integrations/v1/screens \
  -H "Authorization: Bearer $RUBINNY_KEY"
```

```json
{
  "screens": [
    {
      "id": "6f1c…",
      "name": "Lobby",
      "online": true,
      "lastSeenAt": "2026-10-28T09:41:00.000Z",
      "playerVersion": "0.9.0",
      "platform": "web"
    }
  ]
}
```

### Emergency alerts

Start an alert on all screens (`style`: `emergency` or `notice`; `screenIds` and
`durationMinutes` are optional):

```bash
curl -s -X POST https://signage.example.org/api/integrations/v1/alerts \
  -H "Authorization: Bearer $RUBINNY_KEY" -H "Content-Type: application/json" \
  -d '{"style":"emergency","title":"פינוי","message":"צאו מהבניין ביציאה הקרובה"}'
```

The answer has the alert's `id`. List active alerts with `GET /api/integrations/v1/alerts`, and
end one with:

```bash
curl -s -X POST https://signage.example.org/api/integrations/v1/alerts/$ALERT_ID/end \
  -H "Authorization: Bearer $RUBINNY_KEY"
```

The dashboard shows the alert as started by "API: <key name>", and the audit log records the key.

### Text on screens

Change the text of a text widget (`text`, `title`) or a ticker (`text`, `label`). Copy the
widget's id from its address in the dashboard (`/orgs/…/widgets/<id>`).

```bash
curl -s -X PATCH https://signage.example.org/api/integrations/v1/widgets/$WIDGET_ID \
  -H "Authorization: Bearer $RUBINNY_KEY" -H "Content-Type: application/json" \
  -d '{"text":"Next in line: 42"}'
```

`null` removes an optional title or label. Colors, sizes and other widget types cannot be
changed with a key. When the organization **approves content changes**, the answer is 409:
integrations cannot wait for an admin (alerts are not affected).

## Webhooks

An admin adds an `https` address (on the default port) and chooses events. Internal addresses (localhost, private
networks) are refused. The **signing secret** (`whsec_…`) is shown once; "New secret" replaces
it.

| Event                | When                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `screen.offline`     | A screen has not reported for the organization's offline delay     |
| `screen.online`      | That screen is back                                                |
| `alert.started`      | An emergency alert started (dashboard or API)                      |
| `alert.ended`        | It ended (by hand, or its duration passed: then `"expired": true`) |
| `approval.requested` | An editor's change waits for an admin                              |

Each delivery is a `POST` with this body (and `ping` from "Send a test"):

```json
{
  "id": "d3b0…",
  "event": "alert.started",
  "createdAt": "2026-10-28T09:41:00.000Z",
  "organization": { "id": "1a2b…" },
  "data": {
    "alert": {
      "id": "77c1…",
      "style": "emergency",
      "title": "פינוי",
      "screens": "all",
      "endsAt": null
    }
  }
}
```

Payloads carry ids, screen names, alert titles and kinds of things only: never people, e-mail
addresses or meeting titles. Headers:

- `Rubinny-Event`: the event.
- `Rubinny-Delivery`: an id (the same on retries: use it to ignore duplicates).
- `Rubinny-Signature`: `t=<unix seconds>,v1=<hex>`, where `<hex>` is the HMAC-SHA256 of
  `<t>.<raw body>` with the secret.

**Answer with any 2xx within 10 seconds.** Other answers, redirects and timeouts are retried
after 1 and 5 minutes, then 30 minutes and 2, 6 and 12 hours. A webhook that keeps failing (20 attempts in a row, over
at least 6 hours) is turned off, and the organization's admins get an e-mail; turning it on again
in the dashboard starts over. Deliveries are kept for 7 days and listed per webhook.

### Checking the signature

Always check it, and refuse old timestamps (replays).

**Node.js**

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyRubinny(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1 ?? '', 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

**Python**

```python
import hashlib, hmac, time

def verify_rubinny(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = dict(part.split("=", 1) for part in header.split(","))
    t = parts.get("t", "")
    if not t.isdigit() or abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))
```

Use the **raw** request body (before any JSON parsing), as received.

## Privacy

Webhooks send information (screen names and status, alert titles) to a third party of your
choosing. Make sure that is allowed, for example with an agreement (DPA) when the receiver is an
outside service. **This requires legal review** for your situation.
