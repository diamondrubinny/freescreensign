// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { checkPassword } from '../../lib/password.js';
import { HttpError } from '../../lib/http-error.js';

export function assertPasswordAcceptable(password: string, email: string, field = 'password') {
  const problem = checkPassword(password, email);
  if (problem) {
    throw new HttpError(400, 'VALIDATION_FAILED', `Invalid fields: ${field} (${problem})`, [
      { path: field, reason: problem },
    ]);
  }
}
