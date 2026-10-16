import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, app, ipcMain, powerSaveBlocker, session, type WebContents } from 'electron';
import { loadConfig, parseServerUrl, playerUrl, saveConfig } from './config.js';
import { captureScale, isSameOrigin, isSetupPage } from './security.js';

/**
 * Rubinny desktop player: shows the server's web player full screen, keeps the display
 * awake, recovers from crashes, starts with the computer, and gives the player a minimal
 * native bridge (screenshots). See docs/phases/08-wrappers.md.
 */

const VERSION = app.getVersion();
const here = import.meta.dirname;
const PRELOAD = join(here, 'preload.cjs');
const SETUP_URL = pathToFileURL(join(here, '..', 'static', 'setup.html')).toString();
const RELOAD_AFTER_CRASH_MS = 2000;
const RELOAD_WHEN_UNRESPONSIVE_MS = 30_000;
const RETRY_LOAD_MS = 15_000;

// Tests and managed installs may preset the folder and the server.
if (process.env.RUBINNY_USER_DATA) app.setPath('userData', process.env.RUBINNY_USER_DATA);
const presetOrigin = process.env.RUBINNY_SERVER_URL
  ? parseServerUrl(process.env.RUBINNY_SERVER_URL)
  : null;
if (presetOrigin) saveConfig(app.getPath('userData'), { serverOrigin: presetOrigin });

// Signage plays video with sound without a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Machines without a usable GPU (some VMs, virtual displays) cannot capture the compositor's
// output; software rendering fixes screenshots there at some cost in video smoothness.
if (process.env.RUBINNY_DISABLE_GPU === '1') app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let window: BrowserWindow | null = null;
let origin: string | null = null;

function startAtLogin(): void {
  if (!app.isPackaged) return; // never during development or tests
  if (process.platform === 'linux') {
    const dir = join(homedir(), '.config', 'autostart');
    const file = join(dir, 'rubinny-player.desktop');
    if (!existsSync(file)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        file,
        `[Desktop Entry]\nType=Application\nName=Rubinny Player\nExec="${process.execPath}"\nX-GNOME-Autostart-enabled=true\n`,
      );
    }
  } else {
    app.setLoginItemSettings({ openAtLogin: true });
  }
}

/** Shows the player of the configured server, or the setup page. */
function showContent(contents: WebContents): void {
  const config = loadConfig(app.getPath('userData'));
  origin = config?.serverOrigin ?? null;
  void contents.loadURL(origin ? playerUrl(origin) : SETUP_URL).catch(() => undefined);
}

function guard(contents: WebContents): void {
  // Only the configured server (and the setup page) may be shown.
  contents.on('will-navigate', (event, url) => {
    const allowed = (origin !== null && isSameOrigin(url, origin)) || isSetupPage(url, SETUP_URL);
    if (!allowed) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (origin === null || !isSameOrigin(url, origin)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // Recovery: reload after a crash, a hang, or a failed load (offline at boot).
  contents.on('render-process-gone', () => {
    setTimeout(() => {
      showContent(contents);
    }, RELOAD_AFTER_CRASH_MS);
  });
  let hang: ReturnType<typeof setTimeout> | undefined;
  contents.on('unresponsive', () => {
    hang = setTimeout(() => {
      contents.forcefullyCrashRenderer();
    }, RELOAD_WHEN_UNRESPONSIVE_MS);
  });
  contents.on('responsive', () => {
    clearTimeout(hang);
  });
  contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    // -3 is an aborted navigation (e.g. one we blocked); nothing to retry.
    if (!isMainFrame || code === -3 || isSetupPage(url, SETUP_URL)) return;
    setTimeout(() => {
      showContent(contents);
    }, RETRY_LOAD_MS);
  });

  // Admin shortcuts: Ctrl+Shift+Alt+S returns to setup, Ctrl+Shift+Alt+Q quits.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control && input.shift && input.alt)) return;
    const key = input.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      origin = null;
      void contents.loadURL(SETUP_URL);
    } else if (key === 'q') {
      event.preventDefault();
      app.quit();
    }
  });
}

function createWindow(): void {
  const kiosk = process.env.RUBINNY_KIOSK !== '0';
  window = new BrowserWindow({
    kiosk,
    fullscreen: kiosk,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'Rubinny Player',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      additionalArguments: [`--rubinny-version=${VERSION}`],
    },
  });
  window.removeMenu();
  guard(window.webContents);
  showContent(window.webContents);
  window.on('closed', () => {
    window = null;
  });
}

// Only the player page may capture, and only its own window.
ipcMain.handle('rubinny:capture', async (event) => {
  const sender = event.senderFrame?.url ?? '';
  if (!window || origin === null || !isSameOrigin(sender, origin)) {
    throw new Error('Not allowed');
  }
  const image = await window.webContents.capturePage();
  const { width, height } = image.getSize();
  const scale = captureScale(width, height);
  const sized =
    scale < 1
      ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale) })
      : image;
  return new Uint8Array(sized.toJPEG(80));
});

// Only the bundled setup page may change the server address.
ipcMain.handle('rubinny:set-server', (event, input: unknown) => {
  if (!isSetupPage(event.senderFrame?.url ?? '', SETUP_URL) || typeof input !== 'string') {
    throw new Error('Not allowed');
  }
  const parsed = parseServerUrl(input);
  if (!parsed) return { ok: false };
  saveConfig(app.getPath('userData'), { serverOrigin: parsed });
  if (window) showContent(window.webContents);
  return { ok: true };
});

app.on('second-instance', () => {
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

app.on('web-contents-created', (_event, contents) => {
  // Defense in depth for any contents (the window has its own guards too).
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

void app.whenReady().then(() => {
  // No camera, microphone, location, notifications…: signage needs none of them.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  powerSaveBlocker.start('prevent-display-sleep');
  startAtLogin();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
