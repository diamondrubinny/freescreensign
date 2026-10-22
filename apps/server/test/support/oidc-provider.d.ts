// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

// Minimal types for the parts of oidc-provider used by the SSO tests (the package has none).
declare module 'oidc-provider' {
  import type { IncomingMessage, ServerResponse } from 'node:http';

  interface GrantInstance {
    addOIDCScope(scope: string): void;
    save(): Promise<string>;
  }

  export default class Provider {
    constructor(issuer: string, configuration: Record<string, unknown>);
    callback(): (req: IncomingMessage, res: ServerResponse) => void;
    interactionDetails(
      req: IncomingMessage,
      res: ServerResponse,
    ): Promise<{ uid: string; params: Record<string, unknown> }>;
    interactionFinished(
      req: IncomingMessage,
      res: ServerResponse,
      result: Record<string, unknown>,
      options?: { mergeWithLastSubmission?: boolean },
    ): Promise<void>;
    Grant: new (properties: { accountId: string; clientId: string }) => GrantInstance;
    on(event: string, listener: (...args: unknown[]) => void): void;
  }
}
