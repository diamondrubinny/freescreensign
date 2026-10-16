import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Provider from 'oidc-provider';

export interface TestAccount {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export const OIDC_CLIENT_ID = 'rubinny-test';
/** Random per test run (no secret-looking literals in the repository). */
export const OIDC_CLIENT_SECRET = randomBytes(24).toString('base64url');

/**
 * A real OpenID Connect provider (oidc-provider) in this process. The "user" who signs in is
 * `account`; the login and consent screens are skipped by finishing the interaction directly.
 */
export async function startTestProvider(redirectUri: string) {
  let account: TestAccount = { sub: 'user-1' };
  let deny = false;
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const provider = new Provider(issuer, {
    clients: [
      {
        client_id: OIDC_CLIENT_ID,
        client_secret: OIDC_CLIENT_SECRET,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code'],
        response_types: ['code'],
      },
    ],
    claims: { openid: ['sub'], email: ['email', 'email_verified'], profile: ['name'] },
    findAccount: (_ctx: unknown, sub: string) => ({
      accountId: sub,
      claims: () => ({ ...account, sub }),
    }),
    pkce: { required: () => true },
    features: { devInteractions: { enabled: false } },
    interactions: {
      url: (_ctx: unknown, interaction: { uid: string }) => `/interaction/${interaction.uid}`,
    },
    cookies: { keys: [randomBytes(16).toString('hex')] },
    // The ID token carries the claims directly (no extra UserInfo call needed).
    conformIdTokenClaims: false,
  });
  provider.on('server_error', (_ctx, error) => {
    process.stderr.write(`oidc-provider error: ${String(error)}\n`);
  });
  const handle = provider.callback();
  server.on('request', (req, res) => {
    if (req.url?.startsWith('/interaction/')) {
      void (async () => {
        try {
          if (deny) {
            await provider.interactionFinished(req, res, {
              error: 'access_denied',
              error_description: 'The user said no',
            });
            return;
          }
          const details = await provider.interactionDetails(req, res);
          const grant = new provider.Grant({ accountId: account.sub, clientId: OIDC_CLIENT_ID });
          grant.addOIDCScope(
            typeof details.params.scope === 'string' ? details.params.scope : 'openid',
          );
          const grantId = await grant.save();
          await provider.interactionFinished(
            req,
            res,
            { login: { accountId: account.sub }, consent: { grantId } },
            { mergeWithLastSubmission: false },
          );
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      })();
      return;
    }
    handle(req, res);
  });

  return {
    issuer,
    signInAs(next: TestAccount) {
      account = next;
      deny = false;
    },
    denyNext() {
      deny = true;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

/**
 * Follows the browser's redirects through the provider (with its cookies) until it comes
 * back to `stopAt`; returns that URL (the callback with code and state, or an error).
 */
export async function throughProvider(start: string, stopAt: string): Promise<URL> {
  const jar = new Map<string, string>();
  let url = new URL(start);
  for (let hop = 0; hop < 10; hop++) {
    if (url.href.startsWith(stopAt)) return url;
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair = ''] = header.split(';');
      const index = pair.indexOf('=');
      if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
    const location = response.headers.get('location');
    if (!location)
      throw new Error(
        `No redirect from ${url.href}: ${String(response.status)} ${await response.text()}`,
      );
    url = new URL(location, url);
  }
  throw new Error('Too many redirects');
}
