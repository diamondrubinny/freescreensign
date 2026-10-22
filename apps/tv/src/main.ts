// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { startLoader } from './loader';
import { localServerStore } from './storage';

startLoader(document, {
  store: localServerStore(() => window.localStorage),
  // assign, not replace: Back in the player returns here, to change the server.
  navigate: (url) => {
    window.location.assign(url);
  },
});
