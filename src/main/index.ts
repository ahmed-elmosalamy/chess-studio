import { app, BrowserWindow, ipcMain, Menu, protocol, screen, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { AppChannel, WindowChannel, type WindowState } from '@shared/ipc'
import EngineManager from './engine/engineManager'
import LibraryManager from './library/libraryManager'
import OpeningsManager from './openings/openingsManager'
import TablebaseManager from './tablebase/tablebaseManager'

if (!app.isPackaged && process.env['STUDIO_DEBUG_PORT']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['STUDIO_DEBUG_PORT'])
}

// Workers and fetch() cannot load over file://, so the packaged renderer is
// served from a privileged custom scheme instead of loadFile.
protocol.registerSchemesAsPrivileged([
  { scheme: 'chessstudio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

const RENDERER_ROOT = join(__dirname, '../renderer')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
}

function registerAppProtocol(): void {
  protocol.handle('chessstudio', async (request) => {
    const url = new URL(request.url)
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const filePath = normalize(join(RENDERER_ROOT, relative))
    if (!filePath.startsWith(RENDERER_ROOT + sep)) return new Response('Not found', { status: 404 })
    try {
      const data = await readFile(filePath)
      return new Response(data, { headers: { 'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream' } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

let mainWindow: BrowserWindow | null = null
const engines = new EngineManager(() => mainWindow?.webContents ?? null)

function createWindow(): void {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.min(1440, workArea.width),
    height: Math.min(900, workArea.height),
    minWidth: 1120,
    minHeight: 700,
    center: true,
    show: false,
    frame: false,
    backgroundColor: '#0e1013',
    title: 'Chess Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  const sendState = (): void => {
    if (!mainWindow) return
    const state: WindowState = {
      maximized: mainWindow.isMaximized(),
      fullscreen: mainWindow.isFullScreen()
    }
    mainWindow.webContents.send(WindowChannel.State, state)
  }

  mainWindow.on('maximize', sendState)
  mainWindow.on('unmaximize', sendState)
  mainWindow.on('enter-full-screen', sendState)
  mainWindow.on('leave-full-screen', sendState)

  mainWindow.webContents.on('dom-ready', sendState)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL('chessstudio://app/index.html')
  }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'File',
        submenu: [isMac ? { role: 'close' } : { role: 'quit' }]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [{ role: 'toggleDevTools' }, { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'togglefullscreen' }]
      }
    ])
  )
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    buildMenu()
    engines.register()
    new LibraryManager().register()
    new OpeningsManager().register()
    new TablebaseManager().register()
    registerAppProtocol()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => engines.dispose())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

ipcMain.on(WindowChannel.Minimize, (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
ipcMain.on(WindowChannel.ToggleMaximize, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on(WindowChannel.Close, (event) => BrowserWindow.fromWebContents(event.sender)?.close())

ipcMain.handle(AppChannel.Info, () => ({
  name: app.name,
  version: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  platform: process.platform,
  arch: process.arch
}))

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    const origin = new URL(contents.getURL()).origin
    if (new URL(url).origin !== origin) event.preventDefault()
  })
})
