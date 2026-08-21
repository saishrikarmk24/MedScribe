const $ = (id) => document.getElementById(id)
const state = { session: null, recording: false, timer: null, startedAt: 0 }
function showError(message = '') { const node = $('errorMessage'); node.textContent = message; node.classList.toggle('hidden', !message) }
function setStatus(text, recording = false) { state.recording = recording; $('statusText').textContent = text; $('statusDot').classList.toggle('recording', recording); $('recordButton').classList.toggle('active', recording); $('recordButton').textContent = recording ? 'Stop & transcribe' : 'Start recording' }
function formatTime(seconds) { const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }
async function settings() { return chrome.storage.sync.get({ apiBase: 'http://127.0.0.1:8000/api', appBase: 'http://127.0.0.1:5173' }) }
async function request(path, init = {}) { const { apiBase } = await settings(); const response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, init); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.detail || `${response.status} ${response.statusText}`) } return response.json() }
async function recorder(type, values = {}) { const result = await chrome.runtime.sendMessage({ target: 'recorder', type, ...values }); if (!result?.ok) throw new Error(result?.error || 'The Meet recorder is unavailable. Click the extension icon again from the Meet tab.'); return result }
async function showCaptureState() {
  const { captureReady, captureError, captureLevel, micActive, micError } = await chrome.storage.session.get({
    captureReady: false, captureError: '', captureLevel: 0, micActive: false, micError: ''
  })
  $('levelBar').style.width = `${Math.min(100, Number(captureLevel) * 180)}%`

  // Mic status indicator
  if (state.recording) {
    const micDot = $('micDot')
    const micText = $('micText')
    const micErrorEl = $('micError')
    if (micActive) {
      micDot.classList.add('recording')
      micText.textContent = 'Microphone: connected (your voice is being recorded)'
      micErrorEl.classList.add('hidden')
    } else if (micError) {
      micDot.classList.remove('recording')
      micText.textContent = 'Microphone: NOT connected'
      micErrorEl.textContent = micError
      micErrorEl.classList.remove('hidden')
    }
  }

  if (captureReady) setStatus(state.recording ? 'Recording Google Meet tab audio + microphone' : 'Meet tab connected — ready to record', state.recording)
  else { setStatus('Meet tab is not connected'); if (captureError) showError(captureError) }
}
async function createSession() { showError(); const button = $('createButton'); button.disabled = true; try { const session = await request('/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('sessionName').value.trim(), patient_id: $('patientId').value.trim(), scenario: $('scenario').value.trim() || null, simulation_type: $('encounterType').value, doctor_name: $('doctorName').value.trim() || null, mode: 'UPLOAD', audio_source: 'UPLOAD' }) }); await request(`/sessions/${session.id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }); state.session = session; $('sessionReference').textContent = session.reference; $('sessionDisplay').textContent = session.name; $('setupCard').classList.add('hidden'); $('captureCard').classList.remove('hidden'); await showCaptureState() } catch (error) { showError(error.message) } finally { button.disabled = false } }
async function startRecording() {
  showError()
  // Always include microphone — the doctor's voice must be captured for multi-speaker diarization
  await recorder('start', { includeMicrophone: true })
  state.startedAt = Date.now()
  state.timer = setInterval(() => { $('duration').textContent = formatTime((Date.now() - state.startedAt) / 1000) }, 250)
  setStatus('Recording Google Meet tab audio + microphone', true)
  // Refresh mic status after a short delay to pick up micStatus event
  setTimeout(() => void showCaptureState(), 500)
}
async function stopRecording() { if (!state.recording) return; state.recording = false; clearInterval(state.timer); setStatus('Uploading recording for transcription…'); $('recordButton').disabled = true; try { const { apiBase } = await settings(); const result = await recorder('stopAndUpload', { sessionId: state.session.id, apiBase }); if (!result.transcribed) throw new Error(result.message || 'No speech was recognised.'); await request(`/sessions/${state.session.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }); setStatus('Transcription complete — ready for review') } catch (error) { setStatus('Upload failed'); showError(error.message) } finally { $('recordButton').disabled = false; $('levelBar').style.width = '0%' } }
async function discard() { clearInterval(state.timer); await recorder('discard'); state.recording = false; $('duration').textContent = '00:00'; $('levelBar').style.width = '0%'; setStatus('Recording discarded — ready to capture') }
async function openReview() { if (!state.session) return; const { appBase } = await settings(); chrome.tabs.create({ url: `${appBase.replace(/\/$/, '')}/sessions/${state.session.id}/review` }) }
$('createButton').addEventListener('click', createSession); $('recordButton').addEventListener('click', () => (state.recording ? stopRecording() : startRecording()).catch((error) => { setStatus('Meet tab is not connected'); showError(error.message) })); $('discardButton').addEventListener('click', () => discard().catch((error) => showError(error.message))); $('reviewButton').addEventListener('click', openReview); $('settingsButton').addEventListener('click', () => chrome.runtime.openOptionsPage()); showCaptureState()
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && (changes.captureReady || changes.captureError || changes.captureLevel || changes.micActive || changes.micError)) void showCaptureState() })
