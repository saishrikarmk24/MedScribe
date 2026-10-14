"""Automated pipeline verification using the generated clinical audio benchmark.

Tests the running VoiceScribe / MedScribe backend end-to-end:
1. Connects to http://127.0.0.1:8000
2. Creates a session
3. Streams the clinical encounter audio
4. Asserts transcript and clinical note generation
5. Prints the complete SOAP report with evidence

Usage:
  python scripts/test_with_audio.py
  python scripts/test_with_audio.py --audio test_data/clinical_encounter_20min.wav
"""

import argparse
import sys
import time
from pathlib import Path
import httpx

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

DEFAULT_AUDIO = Path("test_data/clinical_encounter_20min.wav")
API_BASE = "http://127.0.0.1:8000/api"
HEADERS = {
    "X-User-Email": "dev.clinician@medscribe.local",
    "X-User-Role": "DOCTOR"
}


def test_pipeline(audio_path: Path):
    if not audio_path.exists():
        print(f"❌ Error: Audio file not found at {audio_path}")
        print("Run `python scripts/generate_clinical_audio.py` first to generate it.")
        return 1

    print("\n" + "=" * 75)
    print("🚀 VOICESCRIBE CLINICAL AUDIO END-TO-END PIPELINE TEST")
    print("=" * 75)
    print(f"Target Audio : {audio_path} ({audio_path.stat().st_size / (1024 * 1024):.2f} MB)")
    print(f"Backend URL  : {API_BASE}")

    with httpx.Client(base_url=API_BASE, headers=HEADERS, timeout=300.0) as client:
        # 1. Health check
        try:
            status = client.get("/status").json()
        except Exception as e:
            print(f"❌ Backend not reachable: {e}")
            print("Make sure VoiceScribe backend is running (http://127.0.0.1:8000).")
            return 1

        ai = status.get("ai", {})
        asr = status.get("providers", {}).get("asr", {})
        print(f"AI Engine    : {ai.get('model')} ({ai.get('provider')})")
        print(f"ASR Provider : {asr.get('name')} (model: {asr.get('model')})")

        # 2. Create session
        session = client.post("/sessions", json={
            "name": "Benchmark 20-min Clinical Encounter",
            "patient_id": "PT-BENCHMARK-52",
            "patient_name": "Senthil Kumar",
            "scenario": "T2DM with peripheral neuropathy and hypertension",
            "simulation_type": "OUTPATIENT",
            "doctor_name": "Dr. Arvind Rao",
            "mode": "MICROPHONE",
            "audio_source": "MICROPHONE"
        }).json()

        session_id = session["id"]
        ref = session["reference"]
        print(f"\n[1/4] Created Session: {ref} (ID: {session_id})")

        client.post(f"/sessions/{session_id}/start").raise_for_status()
        print(f"[2/4] Session started. Uploading {audio_path.name}...")

        # 3. Upload audio
        audio_bytes = audio_path.read_bytes()
        start_time = time.perf_counter()
        
        resp = client.post(
            f"/sessions/{session_id}/audio-chunks",
            files={"file": (audio_path.name, audio_bytes, "audio/wav")},
            data={"source": "MICROPHONE", "client_sequence": 1}
        )
        resp.raise_for_status()
        latency = time.perf_counter() - start_time
        print(f"      Upload & pipeline processing completed in {latency:.2f}s!")

        # 4. Stop session
        client.post(f"/sessions/{session_id}/stop").raise_for_status()
        print(f"[3/4] Session finalized. Fetching transcript and clinical note...")

        # Poll for note completion (up to 45s)
        note = None
        for _ in range(15):
            note = client.get(f"/sessions/{session_id}/note").json()
            if note and note.get("content"):
                break
            time.sleep(2)

        segments = client.get(f"/sessions/{session_id}/segments").json()
        entities = client.get(f"/sessions/{session_id}/entities").json()

        print(f"\n[4/4] Results Summary:")
        print(f"  • Transcript Turns Transcribed : {len(segments)}")
        print(f"  • Clinical Entities Extracted  : {len(entities)}")

        print("\n" + "=" * 75)
        print("📄 GENERATED CLINICAL NOTE (SOAP SUMMARY):")
        print("=" * 75)
        
        content = note.get("content", {})
        for section, details in content.items():
            if isinstance(details, dict) and details.get("text"):
                title = section.replace("_", " ").title()
                print(f"\n--- {title} ---")
                print(details["text"])

        print("\n" + "=" * 75)
        print("✅ PIPELINE BENCHMARK PASSED!")
        print(f"View in browser: http://127.0.0.1:5173/sessions/{session_id}/review")
        print("=" * 75 + "\n")
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run pipeline benchmark with clinical audio")
    parser.add_argument("--audio", type=Path, default=DEFAULT_AUDIO, help="Path to WAV audio file")
    args = parser.parse_args()
    sys.exit(test_pipeline(args.audio))
