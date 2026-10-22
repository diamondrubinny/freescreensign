// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toFormErrors, type FormErrors } from './api-errors';

export function useFormErrors(error: unknown): FormErrors {
  const { t } = useTranslation();
  return useMemo(() => toFormErrors(t, error), [t, error]);
}
