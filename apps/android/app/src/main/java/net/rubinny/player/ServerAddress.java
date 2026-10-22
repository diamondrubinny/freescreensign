// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

package net.rubinny.player;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Rules for the Rubinny server address (the same as the desktop app): https, or plain http
 * only on this device (development and tests); never credentials in the address. Pure Java so
 * it is tested on the JVM.
 */
public final class ServerAddress {
    private ServerAddress() {}

    /** The origin ("https://host[:port]") of an address typed by an installer, or null. */
    public static String parse(String input) {
        if (input == null) return null;
        URI uri;
        try {
            uri = new URI(input.trim());
        } catch (URISyntaxException e) {
            return null;
        }
        if (uri.isOpaque() || uri.getRawUserInfo() != null) return null;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.isEmpty()) return null;
        boolean local = host.equals("localhost") || host.equals("127.0.0.1");
        if (!scheme.equals("https") && !(scheme.equals("http") && local)) return null;
        return origin(uri);
    }

    /** Whether {@code url} is on {@code origin} (scheme, host and port all equal). */
    public static boolean isSameOrigin(String url, String origin) {
        if (url == null || origin == null) return false;
        try {
            URI uri = new URI(url);
            return !uri.isOpaque() && uri.getHost() != null && origin.equals(origin(uri));
        } catch (URISyntaxException e) {
            return false;
        }
    }

    /** The web player of a server. */
    public static String playerUrl(String origin) {
        return origin + "/player/";
    }

    private static String origin(URI uri) {
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        int port = uri.getPort();
        boolean defaultPort =
                port == -1
                        || (scheme.equals("https") && port == 443)
                        || (scheme.equals("http") && port == 80);
        return scheme + "://" + host + (defaultPort ? "" : ":" + port);
    }
}
