package net.rubinny.player;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebViewRenderProcess;
import android.webkit.WebViewRenderProcessClient;
import android.widget.FrameLayout;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Shows the web player of the configured Rubinny server full screen, keeps the screen on,
 * recovers from renderer crashes and hangs, and answers screenshot requests of the player
 * page. See docs/phases/08-wrappers.md.
 */
public final class MainActivity extends ComponentActivity {
    /** Name of the message channel the WebView injects into pages of the server only. */
    static final String CHANNEL = "RubinnyAndroid";

    private static final long RELOAD_AFTER_CRASH_MS = 2_000;
    private static final long KILL_WHEN_UNRESPONSIVE_MS = 30_000;
    private static final long RETRY_LOAD_MS = 15_000;
    private static final long MIN_CAPTURE_INTERVAL_MS = 2_000;
    private static final int ADMIN_BACK_PRESSES = 5;
    private static final long ADMIN_BACK_WINDOW_MS = 4_000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService encoder = Executors.newSingleThreadExecutor();
    private FrameLayout root;
    private WebView web;
    private String origin;
    private boolean capturing;
    private long lastCaptureAt;
    private int backPresses;
    private long firstBackAt;
    private final Runnable reload = this::reloadPlayer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        origin = Settings.serverOrigin(this);
        if (origin == null) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        createWebView();
        getOnBackPressedDispatcher()
                .addCallback(
                        this,
                        new OnBackPressedCallback(true) {
                            @Override
                            public void handleOnBackPressed() {
                                onAdminBack();
                            }
                        });
    }

    /** Back never leaves the kiosk; pressed five times quickly, it opens the setup page. */
    private void onAdminBack() {
        long now = SystemClock.elapsedRealtime();
        if (now - firstBackAt > ADMIN_BACK_WINDOW_MS) {
            firstBackAt = now;
            backPresses = 0;
        }
        if (++backPresses >= ADMIN_BACK_PRESSES) {
            backPresses = 0;
            startActivity(new Intent(this, SetupActivity.class));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        encoder.shutdownNow();
        destroyWebView();
        super.onDestroy();
    }

    /** The player's WebView (for the instrumented tests). */
    WebView webView() {
        return web;
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller == null) return;
            controller.hide(WindowInsets.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        } else {
            hideSystemBarsLegacy();
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBarsLegacy() {
        getWindow()
                .getDecorView()
                .setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                | View.SYSTEM_UI_FLAG_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private void createWebView() {
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.BLACK);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Signage plays video with sound without a tap.
        settings.setMediaPlaybackRequiresUserGesture(false);
        // The page gets nothing from the device: no files, no content providers, no location.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(
                settings.getUserAgentString() + " RubinnyAndroid/" + BuildConfig.VERSION_NAME);
        view.setWebViewClient(new Guard());
        view.setWebChromeClient(new NoPermissions());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            view.setWebViewRenderProcessClient(new HangWatch());
        }
        // The channel exists only in frames of the server's origin, so other sites shown in
        // the player (e.g. a web page widget) can never ask for a screenshot.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                    view, CHANNEL, Collections.singleton(origin), this::onChannelMessage);
        }
        root.addView(
                view,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web = view;
        view.loadUrl(ServerAddress.playerUrl(origin));
    }

    private void destroyWebView() {
        if (web == null) return;
        root.removeView(web);
        web.destroy();
        web = null;
    }

    private void reloadPlayer() {
        if (web != null) web.loadUrl(ServerAddress.playerUrl(origin));
    }

    /** Navigation guard and recovery. */
    private final class Guard extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Frames may show other sites (web page widgets); the player itself may not leave.
            if (!request.isForMainFrame()) return false;
            return !ServerAddress.isSameOrigin(request.getUrl().toString(), origin);
        }

        @Override
        public void onReceivedError(
                WebView view, WebResourceRequest request, WebResourceError error) {
            // Offline at boot before the player was ever cached: try again.
            if (request.isForMainFrame()) {
                main.removeCallbacks(reload);
                main.postDelayed(reload, RETRY_LOAD_MS);
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // The renderer crashed or was killed: this WebView is unusable, build a new one.
            if (view == web) {
                destroyWebView();
                main.postDelayed(
                        () -> {
                            if (!isFinishing() && !isDestroyed() && web == null) createWebView();
                        },
                        RELOAD_AFTER_CRASH_MS);
            } else {
                view.destroy();
            }
            return true;
        }
    }

    /** Every permission (camera, microphone, location…) is refused: signage needs none. */
    private static final class NoPermissions extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(
                String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false);
        }
    }

    /** A renderer that stays unresponsive is killed (and then rebuilt, see onRenderProcessGone). */
    private final class HangWatch extends WebViewRenderProcessClient {
        private Runnable kill;

        @Override
        public void onRenderProcessUnresponsive(WebView view, WebViewRenderProcess renderer) {
            if (kill != null || renderer == null) return;
            kill =
                    () -> {
                        kill = null;
                        renderer.terminate();
                    };
            main.postDelayed(kill, KILL_WHEN_UNRESPONSIVE_MS);
        }

        @Override
        public void onRenderProcessResponsive(WebView view, WebViewRenderProcess renderer) {
            if (kill != null) main.removeCallbacks(kill);
            kill = null;
        }
    }

    /** A message from the player page: {"type":"capture","id":n}. */
    private void onChannelMessage(
            WebView view,
            WebMessageCompat message,
            Uri sourceOrigin,
            boolean isMainFrame,
            JavaScriptReplyProxy reply) {
        // Only the player page itself, on the configured server (checked again here).
        if (view != web || !isMainFrame) return;
        if (!ServerAddress.isSameOrigin(sourceOrigin.toString(), origin)) return;
        String data = message.getData();
        int id;
        try {
            JSONObject request = new JSONObject(data == null ? "" : data);
            if (!"capture".equals(request.optString("type"))) return;
            id = request.getInt("id");
        } catch (JSONException e) {
            return;
        }
        long now = SystemClock.elapsedRealtime();
        if (capturing || now - lastCaptureAt < MIN_CAPTURE_INTERVAL_MS) {
            answer(reply, id, null, "busy");
            return;
        }
        capturing = true;
        lastCaptureAt = now;
        capture(reply, id);
    }

    /** Copies what the window shows (including video surfaces) and encodes it as JPEG. */
    private void capture(JavaScriptReplyProxy reply, int id) {
        View decor = getWindow().getDecorView();
        int width = decor.getWidth();
        int height = decor.getHeight();
        if (width <= 0 || height <= 0) {
            finishCapture(reply, id, null, "not visible");
            return;
        }
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        try {
            PixelCopy.request(
                    getWindow(),
                    bitmap,
                    result -> {
                        if (result != PixelCopy.SUCCESS) {
                            bitmap.recycle();
                            finishCapture(reply, id, null, "copy failed (" + result + ")");
                            return;
                        }
                        encoder.execute(
                                () -> {
                                    String jpeg = encode(bitmap);
                                    main.post(() -> finishCapture(reply, id, jpeg, "encode failed"));
                                });
                    },
                    main);
        } catch (IllegalArgumentException e) {
            bitmap.recycle();
            finishCapture(reply, id, null, "copy failed");
        }
    }

    /** JPEG (quality 80, at most 1920 px on the larger side) as base64, or null. */
    private static String encode(Bitmap bitmap) {
        Bitmap scaled = bitmap;
        try {
            double scale = CaptureSize.scale(bitmap.getWidth(), bitmap.getHeight());
            if (scale < 1) {
                scaled =
                        Bitmap.createScaledBitmap(
                                bitmap,
                                (int) Math.round(bitmap.getWidth() * scale),
                                (int) Math.round(bitmap.getHeight() * scale),
                                true);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (!scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)) return null;
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (RuntimeException e) {
            return null;
        } finally {
            if (scaled != bitmap) scaled.recycle();
            bitmap.recycle();
        }
    }

    private void finishCapture(JavaScriptReplyProxy reply, int id, String jpeg, String error) {
        capturing = false;
        answer(reply, id, jpeg, error);
    }

    private void answer(JavaScriptReplyProxy reply, int id, String jpeg, String error) {
        try {
            JSONObject answer = new JSONObject().put("id", id);
            if (jpeg != null) answer.put("jpeg", jpeg);
            else answer.put("error", error);
            reply.postMessage(answer.toString());
        } catch (JSONException | IllegalStateException e) {
            // The page is gone; nobody is waiting for the answer.
        }
    }
}
