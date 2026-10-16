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
