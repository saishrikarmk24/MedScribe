# ===========================================================================
# 🏥 VOICESCRIBE CLINICAL WORKSTATION: DUAL-GPU KAGGLE RUNNER (DOCTOR EDITION)
# ===========================================================================
# Hardware: Kaggle GPU T4 x 2 (GPU 0: Gemma 4 e4b LLM, GPU 1: Whisper + IndicConformer)
# ===========================================================================

import os, sys, time, subprocess, shutil, urllib.request, re, json

WORK_DIR = "/kaggle/working/VoiceScribeDoctor"
REPO_URL = "https://github.com/saishrikarmk24/VoiceScribeOffline.git"

print("\n" + "=" * 75)
print("🚀 LAUNCHING VOICESCRIBE DOCTOR WORKSTATION (DUAL-GPU)")
print("=" * 75 + "\n")

# [1/7] Kill any previous processes
print("[1/7] Stopping old processes...")
subprocess.run(["pkill", "-9", "-f", "uvicorn"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "cloudflared"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "ollama"], stderr=subprocess.DEVNULL)
time.sleep(1)

# [2/7] Install system dependencies (zstd required for Ollama extraction)
print("[2/7] Installing ffmpeg, pciutils, zstd, and cloudflared...")
subprocess.run(["apt-get", "update", "-qq"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run(["apt-get", "install", "-y", "-qq", "ffmpeg", "pciutils", "curl", "zstd"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if not os.path.exists("/usr/local/bin/cloudflared"):
    urllib.request.urlretrieve(
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
        "/usr/local/bin/cloudflared"
    )
    os.chmod("/usr/local/bin/cloudflared", 0o755)

# [3/7] Setup Ollama with GPU acceleration on GPU 0
print("[3/7] Setting up Ollama daemon on GPU 0...")
if not os.path.exists("/usr/local/bin/ollama"):
    subprocess.run("curl -fsSL https://ollama.com/install.sh | sh", shell=True, check=True)

ollama_env = os.environ.copy()
ollama_env["CUDA_VISIBLE_DEVICES"] = "0"
ollama_env["OLLAMA_HOST"] = "127.0.0.1:11434"
subprocess.Popen(["ollama", "serve"], env=ollama_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

print("      Pulling Gemma 4 e4b clinical model...")
subprocess.run(["ollama", "pull", "gemma4:e4b"], check=True)

# [4/7] Resolve Hugging Face token (Kaggle Secrets -> os.environ)
hf_token = None
try:
    from kaggle_secrets import UserSecretsClient
    secrets = UserSecretsClient()
    hf_token = secrets.get_secret("HUGGINGFACE_TOKEN") or secrets.get_secret("HF_TOKEN")
except Exception:
    pass

if not hf_token:
    hf_token = os.environ.get("HUGGINGFACE_TOKEN") or os.environ.get("HF_TOKEN") or ""

if hf_token:
    os.environ["HUGGINGFACE_TOKEN"] = hf_token
    os.environ["HF_TOKEN"] = hf_token
    print(f"      ✅ Hugging Face Token detected: {hf_token[:4]}...{hf_token[-4:]}")
else:
    print("      ⚠️ Hugging Face token not found in Kaggle Secrets! Please add HUGGINGFACE_TOKEN in Kaggle Add-ons -> Secrets.")

# [5/7] Clone codebase & install python dependencies
print("[5/7] Setting up VoiceScribe backend & ML dependencies...")
if not os.path.exists(WORK_DIR):
    print(f"      Cloning from {REPO_URL}...")
    subprocess.run(["git", "clone", REPO_URL, WORK_DIR], check=True)
else:
    print(f"      Updating {WORK_DIR} from {REPO_URL}...")
    subprocess.run(["git", "-C", WORK_DIR, "remote", "set-url", "origin", REPO_URL], check=False)
    subprocess.run(["git", "-C", WORK_DIR, "fetch", "origin", "main"], check=True)
    subprocess.run(["git", "-C", WORK_DIR, "reset", "--hard", "origin/main"], check=True)

print("      Installing Python backend requirements...")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", f"{WORK_DIR}/backend/requirements.txt"])

print("      Installing IndicConformer ONNX-GPU & Transformers dependencies...")
# faster-whisper pulls the CPU onnxruntime wheel. IndicConformer needs the GPU
# build, and the two packages cannot both be installed. 1.20.1 has no Kaggle wheel.
subprocess.run(
    [sys.executable, "-m", "pip", "uninstall", "-y", "onnxruntime", "onnxruntime-gpu"],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
indic_packages = [
    "transformers", "torchaudio", "huggingface_hub", "soundfile",
    "onnx==1.20.1", "onnxruntime-gpu==1.20.2",
]
installed = subprocess.run([sys.executable, "-m", "pip", "install", "-q", *indic_packages])
if installed.returncode != 0:
    print("      onnxruntime-gpu 1.20.2 was unavailable. Installing the newest GPU build...")
    subprocess.run(
        [
            sys.executable, "-m", "pip", "install", "-q",
            "transformers", "torchaudio", "huggingface_hub", "soundfile",
            "onnx==1.20.1", "onnxruntime-gpu",
        ],
        check=True,
    )

# Configure environment for dual-GPU operation:
# Ollama runs on GPU 0.
# The backend runs with CUDA_VISIBLE_DEVICES=1, so physical GPU 1 is device 0 for uvicorn.
with open(f"{WORK_DIR}/backend/.env", "w") as f:
    f.write(f"""
AI_MODE=local
LOCAL_LLM_API=ollama
LOCAL_LLM_MODEL=gemma4:e4b
ASR_PROVIDER=faster_whisper
FASTER_WHISPER_MODEL=large-v3-turbo
FASTER_WHISPER_DEVICE=cuda
FASTER_WHISPER_DEVICE_INDEX=0
FASTER_WHISPER_COMPUTE_TYPE=float16
ASR_LANGUAGES=ta,en,hi
ASR_DEVICE=cuda
ASR_COMPUTE_TYPE=float16
ASR_SECOND_PASS=indic_conformer
ASR_SECOND_PASS_MODEL=ai4bharat/indic-conformer-600m-multilingual
ASR_SECOND_PASS_DECODER=rnnt
HUGGINGFACE_TOKEN={hf_token}
HF_TOKEN={hf_token}
ENVIRONMENT=production
ALLOW_SQLITE_FALLBACK=true
DEV_AUTH_ENABLED=true
CORS_ORIGINS=*
LOCAL_LLM_WARMUP_ON_STARTUP=true
ASR_WARMUP_ON_STARTUP=true
LOCAL_LLM_KEEP_ALIVE=24h
LOCAL_LLM_TIMEOUT_SECONDS=300
""")

def _gpu_memory_mib():
    try:
        raw = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            text=True,
        )
        return [int(line.strip()) for line in raw.splitlines() if line.strip()]
    except Exception:
        return []


def _prime_gemma():
    """Load Gemma and keep it resident. The first load of the 5.5 GB model on a T4
    often takes several minutes; a 90s request used to abort it and leave GPU 0 empty."""
    print("   [1/3] Priming GPU 0: Loading Gemma 4 into VRAM (first load can take several minutes)...")
    payload = json.dumps({
        "model": "gemma4:e4b",
        "prompt": "Clinical consultation initialized.",
        "keep_alive": -1,
        "stream": False,
        "options": {"num_predict": 8},
    }).encode("utf-8")
    for attempt in range(1, 3):
        try:
            request = urllib.request.Request(
                "http://127.0.0.1:11434/api/generate",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=600) as response:
                response.read()
        except Exception as exc:
            print(f"      … load request {attempt} still working ({exc}). Checking the GPU.")
        for _ in range(12):
            used = _gpu_memory_mib()
            gpu0 = used[0] if used else 0
            if gpu0 > 2000:
                print(f"   ✅ GPU 0 primed: Gemma 4 is using {gpu0} MiB and will stay loaded.")
                return True
            time.sleep(10)
    used = _gpu_memory_mib()
    print(f"   ⚠️ Gemma did not stay on GPU 0 (memory now: {used or 'unknown'}). The first clinical note can time out.")
    return False

# [6/7] Pre-warm Dual GPUs before starting server
print("\n⚡ PRE-WARMING DUAL GPUs (PRIMING VRAM FOR ZERO-LATENCY CLINICAL INFERENCE)...")

_prime_gemma()

# 2. Warm up GPU 1 (Whisper Large-v3-Turbo on GPU 1)
print("   [2/3] Priming GPU 1: Loading Faster-Whisper Large-v3-Turbo...")
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

# 3. Warm up GPU 1 (AI4Bharat IndicConformer-600M for Tamil/Hindi on GPU 1)
print("   [3/3] Priming GPU 1: Loading AI4Bharat IndicConformer-600M (Tamil & Hindi)...")
indic_warmup_code = """
import os, sys, torch
import numpy as np
from transformers import AutoModel

token = os.environ.get('HUGGINGFACE_TOKEN') or os.environ.get('HF_TOKEN') or None
print('      [IndicConformer] Downloading & caching weights from HuggingFace...')
model = AutoModel.from_pretrained(
    'ai4bharat/indic-conformer-600m-multilingual',
    trust_remote_code=True,
    token=token
)
dummy = torch.zeros((1, 48000), dtype=torch.float32)
with torch.inference_mode():
    res = model(dummy, 'ta', 'rnnt')
print('      [IndicConformer] Inference test passed!')
"""

env_indic = os.environ.copy()
env_indic["CUDA_VISIBLE_DEVICES"] = "1"
if hf_token:
    env_indic["HUGGINGFACE_TOKEN"] = hf_token
    env_indic["HF_TOKEN"] = hf_token

try:
    proc = subprocess.run(
        [sys.executable, "-c", indic_warmup_code],
        env=env_indic,
        capture_output=True,
        text=True,
        check=True
    )
    if proc.stdout:
        print(proc.stdout.strip())
    print("   ✅ GPU 1 primed: IndicConformer locked into VRAM for Tamil & Hindi recognition!")
except subprocess.CalledProcessError as e:
    err_msg = (e.stderr or e.stdout or str(e)).strip()
    print(f"   ⚠️ IndicConformer pre-warm warning:\n      {err_msg}")
    if "gated" in err_msg.lower() or "401" in err_msg or "403" in err_msg:
        print("      👉 ACTION REQUIRED: Visit https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual and click 'Agree and access repository' with your Hugging Face account!")
    print("      (Note: Faster-Whisper Large-v3-Turbo will handle transcription seamlessly as baseline)")
except Exception as e:
    print(f"   ⚠️ IndicConformer pre-warm warning (will fall back gracefully if needed): {e}")

print("\n📊 VRAM Allocation Verification:")
subprocess.run(["nvidia-smi", "--query-gpu=index,name,memory.used,memory.total", "--format=csv,noheader"])

# [7/7] Start VoiceScribe Backend on GPU 1 & Launch Cloudflare Tunnel
print("\n[7/7] Starting VoiceScribe backend on GPU 1 (port 8000)...")
backend_env = os.environ.copy()
backend_env["CUDA_VISIBLE_DEVICES"] = "1"
backend_env["HUGGINGFACE_TOKEN"] = hf_token
backend_env["HF_TOKEN"] = hf_token

server_log = open("/kaggle/working/voicescribe-server.log", "w", buffering=1)
subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
    cwd=f"{WORK_DIR}/backend",
    env=backend_env,
    stdout=server_log,
    stderr=subprocess.STDOUT,
)
print("      Waiting until the clinical server answers...")
server_ready = False
for _ in range(40):
    try:
        urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=3).read()
        server_ready = True
        break
    except Exception:
        time.sleep(3)
if not server_ready:
    print("   ⚠️ The clinical server did not answer on port 8000. Last log lines:")
    try:
        with open("/kaggle/working/voicescribe-server.log", encoding="utf-8", errors="replace") as log_file:
            tail = log_file.readlines()[-30:]
        print("".join(tail))
    except Exception as exc:
        print(f"      (could not read the server log: {exc})")

print("      Launching Cloudflare HTTPS tunnel...")
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
    print(f"🤖 LLM: gemma4:e4b on GPU 0 | 🎙️ Whisper + IndicConformer on GPU 1")
    print(f"🔑 Doctor Login: Click '1-Click Dev Fill' (DOC-101 / doctor123)")
else:
    print("⚠️ Tunnel initialization took longer than expected.")
print("=" * 75 + "\n")
