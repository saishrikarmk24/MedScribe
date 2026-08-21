let recorderPort = null
let recorderReady = null
const pending = new Map()

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'medscribe-recorder') return
  recorderPort = port
  recorderReady?.()
  recorderReady = null
  port.onMessage.addListener(({ requestId, result, event, level, active, error }) => {
    if (event === 'level') {
      chrome.storage.session.set({ captureLevel: Number(level) || 0 })
      return
    }
    if (event === 'micStatus') {
      chrome.storage.session.set({ micActive: !!active, micError: error || '' })
      return
    }
    const resolve = pending.get(requestId)
    if (resolve) { pending.delete(requestId); resolve(result) }
  })
  port.onDisconnect.addListener(() => { if (recorderPort === port) recorderPort = null })
})

async function ensureRecorderDocument() {
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/recorder.html',
      reasons: ['USER_MEDIA'],
      justification: 'Hold an authorized Google Meet tab audio stream while the clinician starts and stops a recording.',
    })
  } catch (error) {
    if (!String(error.message || error).includes('Only a single offscreen')) throw error
  }
  if (recorderPort) return
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The background recorder did not load. Reload the extension and try again.')), 5000)
    recorderReady = () => { clearTimeout(timeout); resolve() }
  })
}

async function sendToRecorder(type, payload = {}) {
  await ensureRecorderDocument()
  if (!recorderPort) throw new Error('The background recorder is unavailable.')
  const requestId = crypto.randomUUID()
  return new Promise((resolve) => {
    pending.set(requestId, resolve)
    recorderPort.postMessage({ requestId, type, ...payload })
  })
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['apiBase', 'appBase'], (settings) => {
    const defaults = {}
    if (!settings.apiBase) defaults.apiBase = 'http://127.0.0.1:8000/api'
    if (!settings.appBase) defaults.appBase = 'http://127.0.0.1:5173'
    if (Object.keys(defaults).length) chrome.storage.sync.set(defaults)
  })
  ensureRecorderDocument().catch(() => {})
})

chrome.runtime.onStartup.addListener(() => ensureRecorderDocument().catch(() => {}))

async function prepareCapture(tab) {
  await chrome.storage.session.set({ captureReady: false, captureError: '', captureLevel: 0 })
  try {
    if (!tab.id || !/^https:\/\/meet\.google\.com\//.test(tab.url || '')) throw new Error('Open a Google Meet tab first. Chrome cannot capture extension, settings, or other Chrome pages.')
    // Chrome stream IDs expire after a few seconds. Ensure the offscreen consumer
    // is connected before asking Chrome to mint the one-time stream ID.
    await ensureRecorderDocument()
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id })
    const prepared = await sendToRecorder('prepare', { streamId })
    if (!prepared?.ok) throw new Error(prepared?.error || 'The recorder could not connect to the Meet tab.')
    await chrome.storage.session.set({ captureReady: true, captureError: '' })
  } catch (error) {
    await chrome.storage.session.set({ captureReady: false, captureError: error.message || String(error) })
  }
}

chrome.action.onClicked.addListener((tab) => {
  // Open synchronously in the toolbar-click gesture; waiting for recorder setup
  // first causes Chrome to discard the gesture and silently refuse the panel.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
  void prepareCapture(tab)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'recorder') return
  sendToRecorder(message.type, message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }))
  return true
})
