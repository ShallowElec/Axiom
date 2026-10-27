import { app, BrowserWindow, Menu, crashReporter, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const isDev = Boolean(process.env.ELECTRON_START_URL);
const monitorEnabled = process.env.AXIOM_MONITOR === '1';
app.setName('Axiom');

let monitorLogPath = '';
let monitorTimer: NodeJS.Timeout | null = null;

function monitorLog(event: string, data?: unknown): void {
  const line = `${new Date().toISOString()} [${event}]${data === undefined ? '' : ` ${typeof data === 'string' ? data : JSON.stringify(data)}`}`;
  console.log(line);
  if (!monitorLogPath) return;
  try {
    fs.appendFileSync(monitorLogPath, `${line}\n`, 'utf8');
  } catch {
    // Monitoring must never take the app down.
  }
}

function prepareMonitor(): void {
  if (!monitorEnabled) return;
  const fallbackDir = path.join(process.cwd(), '.axiom-monitor');
  monitorLogPath = process.env.AXIOM_MONITOR_LOG || path.join(fallbackDir, 'axiom-live.log');
  const monitorDir = path.dirname(monitorLogPath);
  fs.mkdirSync(monitorDir, { recursive: true });
  fs.mkdirSync(path.join(monitorDir, 'crash-dumps'), { recursive: true });
  fs.appendFileSync(monitorLogPath, `\n===== Axiom monitor session ${new Date().toISOString()} =====\n`, 'utf8');
  monitorLog('session-start', {
    app: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    pid: process.pid,
    cwd: process.cwd(),
    argv: process.argv,
    env: {
      ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? null,
      MATRIX_NO_SANDBOX: process.env.MATRIX_NO_SANDBOX ?? null,
      AXIOM_MONITOR: process.env.AXIOM_MONITOR ?? null,
    },
  });
  try {
    app.setPath('crashDumps', path.join(monitorDir, 'crash-dumps'));
    crashReporter.start({ uploadToServer: false, compress: true });
    const previous = crashReporter.getLastCrashReport();
    if (previous) monitorLog('previous-crash-report', previous);
  } catch (error) {
    monitorLog('crash-reporter-start-failed', error instanceof Error ? error.message : String(error));
  }
  monitorLog('log-file', monitorLogPath);
  monitorTimer = setInterval(() => {
    if (!BrowserWindow.getAllWindows().length) return;
    let win: BrowserWindow | null = null;
    try { win = BrowserWindow.getAllWindows()[0] ?? null; } catch { /* ignore */ }
    const metrics = app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpu: Number(metric.cpu.percentCPUUsage.toFixed(1)),
      workingSetMB: Math.round(metric.memory.workingSetSize / 1024),
      peakWorkingSetMB: Math.round(metric.memory.peakWorkingSetSize / 1024),
    }));
    monitorLog('metrics', {
      windowAlive: Boolean(win && !win.isDestroyed()),
      focused: Boolean(win && !win.isDestroyed() && win.isFocused()),
      process: process.memoryUsage(),
      processes: metrics,
    });
  }, 10000);
  monitorTimer.unref?.();
}

process.on('uncaughtException', (error) => {
  monitorLog('main-uncaught-exception', error instanceof Error ? { message: error.message, stack: error.stack } : String(error));
  // Preserve a hard failure after recording it; do not leave a half-alive app.
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  monitorLog('main-unhandled-rejection', reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason));
});

function createMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Axiom',
            submenu: [
              { role: 'about', label: '关于 Axiom' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏 Axiom' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出 Axiom' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新载入' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    monitorLog('window-ready-to-show');
    win.show();
  });
  win.webContents.on('did-start-loading', () => monitorLog('did-start-loading'));
  win.webContents.on('dom-ready', () => monitorLog('dom-ready'));
  win.webContents.on('did-finish-load', () => monitorLog('did-finish-load'));
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('[axiom] page failed to load', code, description, url);
    monitorLog('did-fail-load', { code, description, url });
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[axiom] renderer stopped', details);
    monitorLog('renderer-process-gone', details);
  });
  win.webContents.on('unresponsive', () => monitorLog('renderer-unresponsive'));
  win.webContents.on('responsive', () => monitorLog('renderer-responsive'));
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    monitorLog('preload-error', { preloadPath, message: error.message, stack: error.stack });
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) monitorLog('renderer-console', { level, message, line, sourceId });
  });
  win.on('close', () => monitorLog('window-close'));
  win.on('closed', () => monitorLog('window-closed'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith(process.env.ELECTRON_START_URL || '\u0000')) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.ELECTRON_START_URL) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Optional visual smoke-test hook. It never runs unless MATRIX_CAPTURE is set.
  if (process.env.MATRIX_CAPTURE) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, Number(process.env.MATRIX_CAPTURE_DELAY || 1800)));
      const image = await win.webContents.capturePage();
      fs.writeFileSync(process.env.MATRIX_CAPTURE as string, image.toPNG());
      if (!process.env.MATRIX_KEEP_OPEN) app.quit();
    });
  }
}

app.whenReady().then(() => {
  prepareMonitor();
  createMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  monitorLog('window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('child-process-gone', (_event, details) => {
  monitorLog('child-process-gone', details);
});

app.on('before-quit', () => {
  monitorLog('before-quit');
});

app.on('will-quit', () => {
  monitorLog('will-quit');
  if (monitorTimer) clearInterval(monitorTimer);
});

app.on('gpu-info-update', () => {
  if (!monitorEnabled) return;
  monitorLog('gpu-info', app.getGPUFeatureStatus());
});
