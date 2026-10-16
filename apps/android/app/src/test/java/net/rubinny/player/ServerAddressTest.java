package net.rubinny.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ServerAddressTest {
    @Test
    public void acceptsHttpsAndLocalHttpOnly() {
        assertEquals(
                "https://signage.example.com",
                ServerAddress.parse(" https://Signage.Example.com/player/?x=1 "));
        assertEquals("https://signage.example.com", ServerAddress.parse("https://signage.example.com:443"));
        assertEquals("https://signage.example.com:8443", ServerAddress.parse("https://signage.example.com:8443/"));
        assertEquals("http://127.0.0.1:8080", ServerAddress.parse("http://127.0.0.1:8080"));
        assertEquals("http://localhost", ServerAddress.parse("http://localhost:80"));

        assertNull(ServerAddress.parse("http://signage.example.com"));
        assertNull(ServerAddress.parse("https://user:pass@signage.example.com"));
        assertNull(ServerAddress.parse("https://user@signage.example.com"));
        assertNull(ServerAddress.parse("file:///etc/passwd"));
        assertNull(ServerAddress.parse("javascript:alert(1)"));
        assertNull(ServerAddress.parse("content://net.rubinny.player/x"));
        assertNull(ServerAddress.parse("signage.example.com"));
        assertNull(ServerAddress.parse("https://"));
        assertNull(ServerAddress.parse("https://bad host"));
        assertNull(ServerAddress.parse(""));
        assertNull(ServerAddress.parse(null));
    }

    @Test
    public void comparesOriginsExactly() {
        String origin = "https://a.example";
        assertTrue(ServerAddress.isSameOrigin("https://a.example/player/", origin));
        assertTrue(ServerAddress.isSameOrigin("https://A.example:443/x?y#z", origin));
        assertFalse(ServerAddress.isSameOrigin("https://a.example.evil.test/", origin));
        assertFalse(ServerAddress.isSameOrigin("https://evil.test/?https://a.example", origin));
        assertFalse(ServerAddress.isSameOrigin("http://a.example/", origin));
        assertFalse(ServerAddress.isSameOrigin("https://a.example:444/", origin));
        assertFalse(ServerAddress.isSameOrigin("https://user@a.example/", "https://user@a.example"));
        assertFalse(ServerAddress.isSameOrigin("javascript:alert(1)", origin));
        assertFalse(ServerAddress.isSameOrigin("not a url", origin));
        assertFalse(ServerAddress.isSameOrigin(null, origin));
        assertEquals("https://a.example/player/", ServerAddress.playerUrl(origin));
    }

    @Test
    public void scalesScreenshotsDownOnly() {
        assertEquals(0.5, CaptureSize.scale(3840, 2160), 1e-9);
        assertEquals(1.0, CaptureSize.scale(1080, 1920), 1e-9);
        assertEquals(1.0, CaptureSize.scale(800, 600), 1e-9);
    }
}
