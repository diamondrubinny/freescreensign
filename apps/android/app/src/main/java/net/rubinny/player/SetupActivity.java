package net.rubinny.player;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Asks for the server address (first start, or five quick Back presses in the player) and
 * explains how to start the player with the device. Built in code: one small form, labelled
 * for screen readers, usable with a TV remote, right-to-left in Hebrew.
 */
public final class SetupActivity extends Activity {
    EditText address;
    TextView error;
    private TextView bootStatus;
    private Button bootButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int padding = dp(24);

        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(padding, padding, padding, padding);

        TextView title = text(R.string.setup_title, 28);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) title.setAccessibilityHeading(true);
        form.addView(title);
        form.addView(spaced(text(R.string.setup_intro, 18)));

        TextView label = text(R.string.setup_label, 18);
        form.addView(spaced(label));
        address = new EditText(this);
        address.setId(View.generateViewId());
        address.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setSingleLine(true);
        address.setHint(R.string.setup_hint);
        // An address reads left to right, also in a Hebrew interface.
        address.setTextDirection(View.TEXT_DIRECTION_LTR);
        address.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        String current = Settings.serverOrigin(this);
        address.setText(current != null ? current : "https://");
        address.setSelection(address.getText().length());
        address.setOnEditorActionListener(
                (view, action, event) -> {
                    if (action != EditorInfo.IME_ACTION_GO) return false;
                    connect();
                    return true;
                });
        label.setLabelFor(address.getId());
        form.addView(address);

        error = text(0, 16);
        error.setTextColor(0xFFFF8A80);
        error.setVisibility(View.GONE);
        error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        form.addView(error);

        Button connect = new Button(this);
        connect.setText(R.string.setup_connect);
        connect.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        connect.setOnClickListener(view -> connect());
        form.addView(spaced(connect));

        TextView bootTitle = text(R.string.setup_boot_title, 22);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) bootTitle.setAccessibilityHeading(true);
        form.addView(spaced(bootTitle));
        form.addView(text(R.string.setup_boot_intro, 16));
        bootStatus = text(0, 16);
        bootStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        form.addView(bootStatus);
        bootButton = new Button(this);
        bootButton.setText(R.string.setup_boot_allow);
        bootButton.setOnClickListener(view -> allowStartOnBoot());
        form.addView(bootButton);
        form.addView(spaced(text(R.string.setup_admin_hint, 16)));

        ScrollView scroll = new ScrollView(this);
        scroll.setFitsSystemWindows(true);
        scroll.addView(
                form,
                new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
        address.requestFocus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        boolean allowed =
                Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                        || android.provider.Settings.canDrawOverlays(this);
        bootButton.setVisibility(allowed ? View.GONE : View.VISIBLE);
        bootStatus.setText(allowed ? getString(R.string.setup_boot_ready) : "");
    }

    /** Validates and saves the address, then opens the player. */
    void connect() {
        if (!Settings.setServer(this, address.getText().toString())) {
            error.setText(R.string.setup_invalid);
            error.setVisibility(View.VISIBLE);
            address.requestFocus();
            return;
        }
        error.setVisibility(View.GONE);
        startActivity(
                new Intent(this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        finish();
    }

    private void allowStartOnBoot() {
        Intent intent =
                new Intent(
                        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // Many TV devices have no such screen.
            bootStatus.setText(R.string.setup_boot_unavailable);
        }
    }

    private TextView text(int resource, int sizeSp) {
        TextView view = new TextView(this);
        if (resource != 0) view.setText(resource);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        view.setGravity(Gravity.START);
        view.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        return view;
    }

    private <T extends View> T spaced(T view) {
        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(16);
        view.setLayoutParams(params);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
