// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { Locale } from '@rubinny/shared';
import type { Env } from '../../config/env.js';
import { renderMail, type MailTemplate, type RenderedMail } from './templates.js';

export interface OutgoingMail extends RenderedMail {
  to: string;
}

export interface Mailer {
  /** Whether messages actually reach recipients (false when mail is disabled). */
  readonly delivers: boolean;
  send(to: string, locale: Locale, template: MailTemplate): Promise<void>;
}

/** Captures messages in memory. For tests. */
export class MemoryMailer implements Mailer {
  readonly delivers = true;
  readonly sent: (OutgoingMail & { template: MailTemplate })[] = [];

  send(to: string, locale: Locale, template: MailTemplate): Promise<void> {
    this.sent.push({ to, template, ...renderMail(template, locale) });
    return Promise.resolve();
  }

  lastTo(to: string): (OutgoingMail & { template: MailTemplate }) | undefined {
    return this.sent.findLast((mail) => mail.to === to);
  }
}

class SmtpMailer implements Mailer {
  readonly delivers = true;
  readonly #transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
    private readonly log: FastifyBaseLogger,
  ) {
    this.#transport = nodemailer.createTransport(url);
  }

  async send(to: string, locale: Locale, template: MailTemplate): Promise<void> {
    const mail = renderMail(template, locale);
    try {
      await this.#transport.sendMail({ from: this.from, to, ...mail });
    } catch (err) {
      // Never surface SMTP failures to the requester (could leak account existence).
      this.log.error({ err, kind: template.kind }, 'failed to send email');
    }
  }
}

/** Development only: prints messages (including secret links) to stdout. */
class ConsoleMailer implements Mailer {
  readonly delivers = true;
  constructor(private readonly log: FastifyBaseLogger) {}

  send(to: string, locale: Locale, template: MailTemplate): Promise<void> {
    const mail = renderMail(template, locale);
    this.log.info({ to, subject: mail.subject, text: mail.text }, 'DEV MAIL (not sent)');
    return Promise.resolve();
  }
}

class DisabledMailer implements Mailer {
  readonly delivers = false;
  send(): Promise<void> {
    return Promise.resolve();
  }
}

export function createMailer(env: Env, log: FastifyBaseLogger): Mailer {
  switch (env.MAIL_TRANSPORT) {
    case 'smtp':
      // Presence is guaranteed by env validation.
      return new SmtpMailer(env.SMTP_URL ?? '', env.MAIL_FROM ?? '', log);
    case 'console':
      return new ConsoleMailer(log);
    case 'disabled':
      return new DisabledMailer();
  }
}
