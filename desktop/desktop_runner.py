"""SIMS VoiceScribe AI - Embedded Desktop Runner.

Runs the lightweight MedScribe FastAPI backend locally on 127.0.0.1:18420.
Pre-configures the SRM / SIMS institutional Gemini API key and points SQLite
storage to the local AppData directory (%APPDATA%\\SIMS-VoiceScribe).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Set repository root so Python finds app.* modules
DESKTOP_DIR = Path(__file__).resolve().parent
REPO_ROOT = DESKTOP_DIR.parent
if (DESKTOP_DIR / "app").is_dir():
    BACKEND_DIR = DESKTOP_DIR
elif (REPO_ROOT / "backend").is_dir():
    BACKEND_DIR = REPO_ROOT / "backend"
else:
    BACKEND_DIR = DESKTOP_DIR

sys.path.insert(0, str(BACKEND_DIR))
os.chdir(str(BACKEND_DIR))

# --- Injected SRM / SIMS Institutional Configuration ---
from dotenv import load_dotenv

load_dotenv(BACKEND_DIR / ".env")
load_dotenv(DESKTOP_DIR / ".env")
load_dotenv(REPO_ROOT / ".env")
os.environ["GEMINI_MODEL"] = "gemini-3.8-flash"
os.environ["GEMINI_ASR_MODEL"] = "gemini-3.8-flash"
os.environ["AI_MODE"] = "gemini"
os.environ["ASR_PROVIDER"] = "gemini"
os.environ["DIARIZATION_PROVIDER"] = "gemini"
os.environ["ENVIRONMENT"] = "production"
os.environ["DEV_AUTH_ENABLED"] = "true"
os.environ["ALLOW_SQLITE_FALLBACK"] = "true"
os.environ["CORS_ORIGINS"] = "*"
os.environ["GEMINI_UPDATE_INTERVAL_SECONDS"] = "10.0"
os.environ["GEMINI_MIN_SEGMENTS_PER_UPDATE"] = "4"
os.environ["LOG_LEVEL"] = "WARNING"

# --- Dedicated Hospital Storage Directory ---
# Consultations are stored safely in the doctor's AppData directory
appdata = os.environ.get("APPDATA") or os.environ.get("HOME") or str(Path.home())
sims_storage = Path(appdata) / "SIMS-VoiceScribe"
sims_storage.mkdir(parents=True, exist_ok=True)
(sims_storage / "audio").mkdir(parents=True, exist_ok=True)

db_path = sims_storage / "sims_records.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
os.environ["SQLITE_FALLBACK_URL"] = os.environ["DATABASE_URL"]
os.environ["AUDIO_STORAGE_DIR"] = (sims_storage / "audio").as_posix()

if __name__ == "__main__":
    import uvicorn

    print("=" * 65)
    print("[SIMS] SIMS VoiceScribe AI - Embedded Medical Desktop Engine")
    print(f"[*] Storage Database : {db_path}")
    print("[*] Model Engine      : Google Gemini 3.5 Flash Lite (SRM Institutional)")
    print("[*] Port              : 127.0.0.1:18420")
    print("=" * 65)

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=18420,
        log_level="warning",
        access_log=False,
    )
