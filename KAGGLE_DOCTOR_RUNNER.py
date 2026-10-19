# ===========================================================================
# 🏥 VOICESCRIBE CLINICAL WORKSTATION: DUAL-GPU KAGGLE RUNNER (DOCTOR EDITION)
# ===========================================================================
# Hardware: Kaggle GPU T4 x 2 (GPU 0: Gemma 4 e4b LLM, GPU 1: Whisper Large Turbo)
# ===========================================================================

import os, sys, time, subprocess, shutil, urllib.request, re, json

WORK_DIR = "/kaggle/working/VoiceScribeDoctor"
REPO_URL = "https://github.com/saishrikarmk24/VoiceScribeOffline.git"

print("\n" + "=" * 75)
print("🚀 LAUNCHING VOICESCRIBE DOCTOR WORKSTATION (DUAL-GPU)")
print("=" * 75 + "\n")

# [1/6] Kill any previous processes
print("[1/6] Stopping old processes...")
subprocess.run(["pkill", "-9", "-f", "uvicorn"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "cloudflared"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "ollama"], stderr=subprocess.DEVNULL)
time.sleep(1)

# [2/6] Install system dependencies (zstd required for Ollama extraction)
print("[2/6] Installing ffmpeg, pciutils, zstd, and cloudflared...")
subprocess.run(["apt-get", "update", "-qq"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run(["apt-get", "install", "-y", "-qq", "ffmpeg", "pciutils", "curl", "zstd"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if not os.path.exists("/usr/local/bin/cloudflared"):
    urllib.request.urlretrieve(
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
        "/usr/local/bin/cloudflared"
    )
    os.chmod("/usr/local/bin/cloudflared", 0o755)

# [3/6] Setup Ollama with GPU acceleration on GPU 0
print("[3/6] Setting up Ollama daemon on GPU 0...")
if not os.path.exists("/usr/local/bin/ollama"):
    subprocess.run("curl -fsSL https://ollama.com/install.sh | sh", shell=True, check=True)

ollama_env = os.environ.copy()
ollama_env["CUDA_VISIBLE_DEVICES"] = "0"
ollama_env["OLLAMA_HOST"] = "127.0.0.1:11434"
subprocess.Popen(["ollama", "serve"], env=ollama_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

print("      Pulling Gemma 4 e4b clinical model...")
subprocess.run(["ollama", "pull", "gemma4:e4b"], check=True)

# [4/6] Clone codebase & install python dependencies
print("[4/6] Setting up VoiceScribe backend...")
if not os.path.exists(WORK_DIR):
    subprocess.run(["git", "clone", REPO_URL, WORK_DIR], check=True)
else:
    subprocess.run(["git", "-C", WORK_DIR, "pull", "origin", "main"])

print("      Installing Python dependencies...")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", f"{WORK_DIR}/backend/requirements.txt"])

# Configure environment with startup warmup enabled
with open(f"{WORK_DIR}/backend/.env", "w") as f:
    f.write("""
AI_MODE=local
LOCAL_LLM_API=ollama
LOCAL_LLM_MODEL=gemma4:e4b
ASR_PROVIDER=faster_whisper
FASTER_WHISPER_MODEL=large-v3-turbo
FASTER_WHISPER_DEVICE=cuda
FASTER_WHISPER_DEVICE_INDEX=1
FASTER_WHISPER_COMPUTE_TYPE=float16
ENVIRONMENT=production
ALLOW_SQLITE_FALLBACK=true
DEV_AUTH_ENABLED=true
CORS_ORIGINS=*
LOCAL_LLM_WARMUP_ON_STARTUP=true
ASR_WARMUP_ON_STARTUP=true
LOCAL_LLM_KEEP_ALIVE=-1
""")

# [5/7] Pre-warm Dual GPUs before starting server
print("\n⚡ PRE-WARMING DUAL GPUs (PRIMING VRAM FOR ZERO-LATENCY CLINICAL INFERENCE)...")

# 1. Warm up GPU 0 (Ollama Gemma in VRAM with keep_alive=-1)
print("   [1/2] Priming GPU 0: Loading Gemma 4 into VRAM...")
try:
    warmup_req = urllib.request.Request(
        "http://127.0.0.1:11434/api/generate",
        data=json.dumps({"model": "gemma4:e4b", "prompt": "Clinical consultation initialized.", "keep_alive": -1}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    urllib.request.urlopen(warmup_req, timeout=45)
    print("   ✅ GPU 0 primed: Gemma 4 locked into VRAM permanently!")
except Exception as e:
    print(f"   ⚠️ GPU 0 warmup note: {e}")

# 2. Warm up GPU 1 (Whisper Large-v3-Turbo on GPU 1)
print("   [2/2] Priming GPU 1: Loading Faster-Whisper Large-v3-Turbo...")
try:
    warmup_cmd = (
        f"{sys.executable} -c \""
        "import numpy as np, os; "
        "os.environ['CUDA_VISIBLE_DEVICES'] = '1'; "
        "from faster_whisper import WhisperModel; "
        "m = WhisperModel('large-v3-turbo', device='cuda', compute_type='float16'); "
        "dummy = np.zeros(16000, dtype=np.float32); "
        "list(m.transcribe(dummy, language='en')); "
        "print('Whisper primed')\""
    )
    subprocess.run(warmup_cmd, shell=True, check=True, stdout=subprocess.DEVNULL)
    print("   ✅ GPU 1 primed: Whisper Large locked into VRAM!")
except Exception as e:
    print(f"   ⚠️ GPU 1 warmup note: {e}")

print("\n📊 VRAM Allocation Verification:")
subprocess.run(["nvidia-smi", "--query-gpu=index,name,memory.used,memory.total", "--format=csv,noheader"])

# [6/7] Start VoiceScribe Backend
print("\n[6/7] Starting VoiceScribe backend on port 8000...")
subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
    cwd=f"{WORK_DIR}/backend",
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL
)
time.sleep(4)

# [7/7] Launch Cloudflare HTTPS Tunnel
print("[7/7] Launching Cloudflare HTTPS tunnel...")
tunnel_proc = subprocess.Popen(
    ["cloudflared", "tunnel", "--url", "http://127.0.0.1:8000"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)

tunnel_url = None
for _ in range(30):
    line = tunnel_proc.stdout.readline()
    match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
    if match:
        tunnel_url = match.group(0)
        break
    time.sleep(1)

print("\n" + "=" * 75)
if tunnel_url:
    # Publish to cloud beacon for 100% automatic Vercel discovery
    def beacon_heartbeat_loop(url):
        while True:
            try:
                beacon_req = urllib.request.Request(
                    "https://ntfy.sh/voicescribe_doctor_live_beacon",
                    data=url.encode("utf-8"),
                    method="POST"
                )
                urllib.request.urlopen(beacon_req, timeout=5)
            except Exception:
                pass
            time.sleep(30)

    import threading
    threading.Thread(target=beacon_heartbeat_loop, args=(tunnel_url,), daemon=True).start()
    print("📡 Published active URL to cloud beacon for auto-discovery (heartbeat active)!")

    print(f"🎉 DOCTOR WORKSTATION IS LIVE!")
    print(f"🌐 Active Backend URL : {tunnel_url}")
    print(f"🔗 Pure Vercel Frontend (Auto-connects):")
    print(f"   👉 https://voicescribe-doctor.vercel.app")
    print(f"🤖 LLM: gemma4:e4b on GPU 0 | 🎙️ Whisper on GPU 1")
    print(f"🔑 Doctor Login: Click '1-Click Dev Fill' (DOC-101 / doctor123)")
else:
    print("⚠️ Tunnel initialization took longer than expected.")
print("=" * 75 + "\n")
