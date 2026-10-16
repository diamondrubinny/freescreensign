package net.rubinny.player;

import android.content.Context;
import android.content.SharedPreferences;

/** The only setting of the app: the server origin (private app storage, never backed up). */
public final class Settings {
    private static final String FILE = "rubinny";
    private static final String SERVER_ORIGIN = "serverOrigin";

    private Settings() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** The configured server origin, or null (a stored value is validated again). */
    public static String serverOrigin(Context context) {
        String stored = prefs(context).getString(SERVER_ORIGIN, null);
        String parsed = ServerAddress.parse(stored);
        return parsed != null && parsed.equals(stored) ? parsed : null;
    }

    /** Saves the server; returns false (and saves nothing) if the address is not acceptable. */
    public static boolean setServer(Context context, String input) {
        String origin = ServerAddress.parse(input);
        if (origin == null) return false;
        return prefs(context).edit().putString(SERVER_ORIGIN, origin).commit();
    }
}
