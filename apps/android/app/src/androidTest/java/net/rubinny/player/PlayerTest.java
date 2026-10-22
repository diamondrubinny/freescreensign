// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

package net.rubinny.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Runs the real app on a device or emulator against a tiny local "server" (in this process):
 * the player page loads, gets the screenshot channel and a real JPEG; a frame of another origin
 * gets no channel; the page cannot navigate away; a crashed renderer is replaced.
 */
@RunWith(AndroidJUnit4.class)
public class PlayerTest {
    private static final long WAIT_MS = 30_000;

    private ServerSocket server;
    private Thread serverThread;
    private int port;

    /** The fake player page: asks for a screenshot and reports the result in its title. */
    private String playerPage() {
        return "<!doctype html><html><head><title>loading</title></head><body"
                + " style='background:#3366cc'><h1>Rubinny test</h1>"
                // Same host name differs: localhost is another origin than 127.0.0.1.
                + "<iframe src='http://localhost:" + port + "/frame'></iframe>"
                + "<script>"
                + "window.frameResult='pending';"
                + "addEventListener('message',function(e){window.frameResult=String(e.data);});"
                + "var ch=window.RubinnyAndroid;"
                + "if(!ch){document.title='no-channel';}else{"
                + " ch.addEventListener('message',function(e){var r=JSON.parse(e.data);"
                + "  if(r.jpeg){var b=atob(r.jpeg);"
                + "   document.title='jpeg:'+r.id+':'+b.length+':'+b.charCodeAt(0)+','+b.charCodeAt(1);}"
                + "  else{document.title='error:'+r.error;}});"
                + " setTimeout(function(){ch.postMessage(JSON.stringify({type:'capture',id:7}));},1500);"
                + "}</script></body></html>";
    }

    private static final String FRAME_PAGE =
            "<!doctype html><script>parent.postMessage(typeof window.RubinnyAndroid,'*');</script>";

    @Before
    public void startServer() throws IOException {
        server = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        port = server.getLocalPort();
        serverThread = new Thread(this::serve, "test-server");
        serverThread.start();
        Context context = ApplicationProvider.getApplicationContext();
        assertTrue(Settings.setServer(context, "http://127.0.0.1:" + port));
    }

    @After
    public void stopServer() throws Exception {
        server.close();
        serverThread.join(5_000);
    }

    private void serve() {
        while (!server.isClosed()) {
            try (Socket socket = server.accept()) {
                BufferedReader in =
                        new BufferedReader(
                                new InputStreamReader(
                                        socket.getInputStream(), StandardCharsets.UTF_8));
                String requestLine = in.readLine();
                String line;
                while ((line = in.readLine()) != null && !line.isEmpty()) {
                    // Skip the headers.
                }
                String path = requestLine == null ? "" : requestLine.split(" ")[1];
                String body;
                String status = "200 OK";
                if (path.startsWith("/player/")) body = playerPage();
                else if (path.startsWith("/frame")) body = FRAME_PAGE;
                else {
                    status = "404 Not Found";
                    body = "";
                }
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                OutputStream out = socket.getOutputStream();
                out.write(
                        ("HTTP/1.1 " + status + "\r\nContent-Type: text/html; charset=utf-8\r\n"
                                        + "Content-Length: " + bytes.length
                                        + "\r\nConnection: close\r\n\r\n")
                                .getBytes(StandardCharsets.UTF_8));
                out.write(bytes);
                out.flush();
            } catch (IOException e) {
                // Closed by the test, or a broken connection: keep serving until closed.
            }
        }
    }

    /** Runs JavaScript in the player and returns its (JSON) result. */
    private static String eval(ActivityScenario<MainActivity> scenario, String script)
            throws InterruptedException {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        scenario.onActivity(
                activity -> {
                    WebView web = activity.webView();
                    if (web == null) {
                        done.countDown();
                        return;
                    }
                    web.evaluateJavascript(
                            script,
                            value -> {
                                result.set(value);
                                done.countDown();
                            });
                });
        done.await(5, TimeUnit.SECONDS);
        return result.get();
    }

    /** Polls a script until its result starts with {@code prefix}; returns the result. */
    private static String waitFor(ActivityScenario<MainActivity> scenario, String script, String prefix)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + WAIT_MS;
        String value = null;
        while (System.currentTimeMillis() < deadline) {
            value = eval(scenario, script);
            if (value != null && value.startsWith(prefix)) return value;
            Thread.sleep(250);
        }
        throw new AssertionError("Timed out waiting for " + prefix + ", last value: " + value);
    }

    @Test
    public void playerGetsScreenshotChannelOnlyOnItsOwnOrigin() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            String title = waitFor(scenario, "document.title", "\"jpeg:");
            // "jpeg:<id>:<bytes>:<first two bytes>" — a real JPEG starts with FF D8.
            String[] parts = title.replace("\"", "").split(":");
            assertEquals("7", parts[1]);
            assertTrue("JPEG too small: " + title, Integer.parseInt(parts[2]) > 1_000);
            assertEquals("255,216", parts[3]);

            assertEquals("\"undefined\"", waitFor(scenario, "window.frameResult", "\"undefined"));
            String agent = eval(scenario, "navigator.userAgent");
            assertTrue(agent, agent.contains("RubinnyAndroid/" + BuildConfig.VERSION_NAME));
        }
    }

    @Test
    public void playerCannotNavigateAway() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitFor(scenario, "document.title", "\"jpeg:");
            eval(scenario, "location.href='https://example.com/'; window.open('https://example.com/');");
            Thread.sleep(3_000);
            AtomicReference<String> url = new AtomicReference<>();
            scenario.onActivity(activity -> url.set(activity.webView().getUrl()));
            assertEquals("http://127.0.0.1:" + port + "/player/", url.get());
        }
    }

    @Test
    public void crashedRendererIsReplaced() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitFor(scenario, "document.title", "\"jpeg:");
            AtomicReference<WebView> before = new AtomicReference<>();
            scenario.onActivity(
                    activity -> {
                        before.set(activity.webView());
                        // A WebView debugging URL that crashes the renderer process.
                        activity.webView().loadUrl("chrome://crash");
                    });
            long deadline = System.currentTimeMillis() + WAIT_MS;
            AtomicReference<WebView> after = new AtomicReference<>();
            while (System.currentTimeMillis() < deadline) {
                scenario.onActivity(activity -> after.set(activity.webView()));
                if (after.get() != null && after.get() != before.get()) break;
                Thread.sleep(250);
            }
            assertNotNull(after.get());
            assertNotSame(before.get(), after.get());
            waitFor(scenario, "document.title", "\"jpeg:");
        }
    }

    @Test
    public void setupRejectsUnsafeAddressesAndSavesValidOnes() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        try (ActivityScenario<SetupActivity> scenario = ActivityScenario.launch(SetupActivity.class)) {
            scenario.onActivity(
                    activity -> {
                        activity.address.setText("http://signage.example.com");
                        activity.connect();
                        assertEquals(android.view.View.VISIBLE, activity.error.getVisibility());
                    });
            assertEquals("http://127.0.0.1:" + port, Settings.serverOrigin(context));
            scenario.onActivity(
                    activity -> {
                        // A local address that refuses connections: the test reaches no outside host.
                        activity.address.setText(" https://LOCALHOST:9/player/ ");
                        activity.connect();
                    });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            assertEquals("https://localhost:9", Settings.serverOrigin(context));
        }
        assertNull(ServerAddress.parse("https://user:pw@signage.example.com"));
    }
}
