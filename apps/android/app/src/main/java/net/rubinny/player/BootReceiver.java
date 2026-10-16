package net.rubinny.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Opens the player when the device has booted. On Android 10+ the system allows this only if
 * the app may display over other apps; as the home app the player opens anyway.
 */
public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (Settings.serverOrigin(context) == null) return;
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(open);
        } catch (RuntimeException e) {
            // Not allowed to start from the background on this device: nothing else to do.
        }
    }
}
