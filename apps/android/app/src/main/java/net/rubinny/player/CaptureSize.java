// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

package net.rubinny.player;

/** Size rules for screenshots (the server scales and re-encodes them again anyway). */
public final class CaptureSize {
    /** Largest side of a screenshot sent to the server. */
    public static final int MAX_SIZE = 1920;

    private CaptureSize() {}

    /** Scale factor so that the larger side fits {@link #MAX_SIZE} (never enlarges). */
    public static double scale(int width, int height) {
        int largest = Math.max(width, height);
        return largest > MAX_SIZE ? (double) MAX_SIZE / largest : 1;
    }
}
