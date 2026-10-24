const { app, BrowserWindow, session } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

const BACKEND_PORT = 18420
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`
const STATUS_URL = `${BACKEND_URL}/api/status`

let mainWindow = null
let backendProcess = null
let isQuitting = false

function findPythonExecutable() {
  const fs = require('fs')
  if (process.resourcesPath) {
    const packagedVenv = path.resolve(process.resourcesPath, 'backend', '.venv', 'Scripts', 'python.exe')
    if (fs.existsSync(packagedVenv)) {
      return packagedVenv
    }
  }
  const venvPython = path.resolve(__dirname, '..', 'backend', '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvPython)) {
    return venvPython
  }
  return process.platform === 'win32' ? 'python.exe' : 'python3'
}

function findBackendScript() {
  const fs = require('fs')
  if (process.resourcesPath) {
    const packagedScript = path.resolve(process.resourcesPath, 'backend', 'desktop_runner.py')
    if (fs.existsSync(packagedScript)) {
      return packagedScript
    }
  }
  return path.resolve(__dirname, 'desktop_runner.py')
}

function startBackend() {
  const pythonExe = findPythonExecutable()
  const scriptPath = findBackendScript()
  const runDir = path.dirname(scriptPath)

  console.log(`[SIMS Desktop] Spawning micro-backend with: ${pythonExe} at ${scriptPath}`)

  backendProcess = spawn(pythonExe, [scriptPath], {
    cwd: runDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    windowsHide: true,
    stdio: 'ignore'
  })

  backendProcess.on('error', (err) => {
    console.error('[SIMS Desktop] Failed to spawn backend process:', err)
  })

  backendProcess.on('exit', (code, signal) => {
    console.log(`[SIMS Desktop] Backend exited with code ${code} / signal ${signal}`)
    if (!isQuitting) {
      backendProcess = null
    }
  })
}

function waitForBackend(callback, retries = 40, delayMs = 300) {
  let count = 0

  const poll = () => {
    http.get(STATUS_URL, (res) => {
      if (res.statusCode === 200) {
        console.log('[SIMS Desktop] Micro-backend is READY and healthy!')
        callback()
      } else {
        retry()
      }
    }).on('error', () => {
      retry()
    })
  }

  const retry = () => {
    count++
    if (count < retries) {
      setTimeout(poll, delayMs)
    } else {
      console.warn('[SIMS Desktop] Backend startup timed out. Loading anyway...')
      callback()
    }
  }

  poll()
}

function createMainWindow() {
  const iconPath = path.resolve(__dirname, '..', 'frontend', 'public', 'sims-icon.png')

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'SIMS VoiceScribe AI - Ambient Clinical Documentation',
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: '#0a0d14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    }
  })

  // Auto-grant microphone permissions so doctor is never prompted with browser popups
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') return true
    return false
  })
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') return callback(true)
    callback(false)
  })

  mainWindow.loadURL(BACKEND_URL)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function terminateBackend() {
  if (backendProcess) {
    isQuitting = true
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t'], { windowsHide: true })
      } else {
        backendProcess.kill('SIGTERM')
      }
    } catch (e) {
      console.error('[SIMS Desktop] Error terminating backend:', e)
    }
    backendProcess = null
  }
}

app.whenReady().then(() => {
  startBackend()
  waitForBackend(() => {
    createMainWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('before-quit', () => {
  terminateBackend()
})

app.on('window-all-closed', () => {
  terminateBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
