"""High-fidelity clinical consultation audio generator for VoiceScribe / MedScribe.

Generates realistic, multi-turn clinical encounters using Microsoft Edge Neural TTS
(Indian English / Indian clinical accents) with Doctor and Patient voices.

Outputs:
  - test_data/clinical_encounter_20min.wav (16kHz mono, optimal for Whisper & Gemini)
  - test_data/clinical_encounter_20min.mp3
  - test_data/clinical_encounter_20min_transcript.txt

Usage:
  python scripts/generate_clinical_audio.py
  python scripts/generate_clinical_audio.py --duration 20
  python scripts/generate_clinical_audio.py --duration 5
"""

import argparse
import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

# Voice configuration (Neural, human-like Indian English accents)
VOICE_DOCTOR = "en-IN-PrabhatNeural"      # Dr. Arvind Rao (Male, clinical, measured pace)
VOICE_PATIENT = "en-IN-NeerjaNeural"      # Mr./Mrs. Patient (Natural, conversational tone)

CLINICAL_SCRIPT = [
    # --- Part 1: Introduction & Rapport ---
    ("Doctor", "Good morning. Please come in and take a seat. I am Dr. Arvind Rao. How are you feeling today, Mr. Senthil?"),
    ("Patient", "Good morning, Doctor. Doctor, honestly I have not been feeling very well for the past three to four weeks. That is why I came in today."),
    ("Doctor", "I see. Take your time and tell me exactly what has been troubling you the most recently."),
    
    # --- Part 2: History of Present Illness & Neuropathy ---
    ("Patient", "Doctor, mainly in both my feet, there is a constant tingling and burning sensation. Especially when I lie down at night to sleep, the soles of my feet feel like they are on fire, like pins and needles sticking into the skin."),
    ("Doctor", "A burning and tingling sensation in both soles. Did this start suddenly, or has it been gradually building up over several weeks?"),
    ("Patient", "It started slowly, Doctor. At first, maybe two months back, I only felt a little numbness at the tips of my toes after walking. But for the last three weeks, it has spread to the entire sole of both feet up to the ankles."),
    ("Doctor", "Does the burning feel worse at night, and does it ever disturb your sleep?"),
    ("Patient", "Yes, exactly! By 11 PM or midnight, it becomes very uncomfortable. I have to keep taking my feet out from the blanket, and sometimes I wake up twice or thrice in the night because of the pain."),
    ("Doctor", "Have you noticed any weakness in your legs, or do you feel off-balance when you walk or get up quickly from a chair?"),
    ("Patient", "Weakness is not too much, Doctor, but in the dark when I walk to the bathroom, I feel unsteady. Like I cannot clearly feel the texture of the floor under my feet."),
    ("Doctor", "That is an important clue. That sensation suggests peripheral sensory involvement, which we commonly see with longstanding diabetes. Have you noticed any wounds, blisters, or cuts on your feet recently?"),
    ("Patient", "No cuts that I saw, Doctor, but my skin on the heels feels very dry and cracked."),
    
    # --- Part 3: Cardiovascular, Hypertension & Systemic Review ---
    ("Doctor", "Good, we will do a thorough foot examination in a moment. Now, let us review your blood pressure and heart health. Have you had any chest tightness, shortness of breath, or palpitations?"),
    ("Patient", "No chest pain or shortness of breath, Doctor. But in the mornings, sometimes I have a heavy throbbing headache right at the back of my neck."),
    ("Doctor", "A morning occipital headache can often happen when blood pressure runs on the higher side. Are you currently taking your blood pressure medication every single day without missing?"),
    ("Patient", "I am taking Telma 40 mg, Doctor, but to be honest, last month I missed four or five days because my tablet strip was finished and I was traveling for work."),
    ("Doctor", "It is very important never to skip blood pressure medication, Mr. Senthil. Uncontrolled pressure puts extra strain on both your kidneys and your heart. We will check your BP today and see if we need to adjust the dosage."),
    
    # --- Part 4: Gastrointestinal, Reflux & Dietary History ---
    ("Doctor", "How about your digestion and stomach? Any acidity, nausea, or burning in the chest?"),
    ("Patient", "Yes, Doctor, frequent acidity. After dinner, if I eat anything spicy or oily, there is severe heartburn and sour water coming up in my throat. I have been taking Pantocid 40 mg whenever it happens."),
    ("Doctor", "Are you taking the Pantocid only when you get symptoms, or consistently on an empty stomach in the morning?"),
    ("Patient", "Mostly only when the heartburn starts after food, Doctor."),
    ("Doctor", "Understood. Pantoprazole works much better when taken 30 minutes before your morning breakfast so the acid pumps are blocked for the whole day. Taking it after dinner provides much less relief."),
    
    # --- Part 5: Diabetes Management & Medications ---
    ("Doctor", "Let us talk about your diabetes. When was your last HbA1c test done, and what was the value?"),
    ("Patient", "My last test was about six months ago, Doctor. At that time, the HbA1c was 8.4 percent, and the fasting sugar was around 168."),
    ("Doctor", "8.4 percent is definitely higher than our target. For you, we want that HbA1c below 7.0 percent to protect your nerves, eyes, and kidneys. What diabetes tablets are you taking currently?"),
    ("Patient", "I take Metformin 500 mg twice a day, once after breakfast and once after dinner. Sometimes if I feel feverish or have body pain, I also took Dolo 650."),
    ("Doctor", "Have you experienced any episodes of shakiness, sweating, dizziness, or intense hunger that felt like low sugar, or hypoglycemia?"),
    ("Patient", "No dizziness or sweating like low sugar, Doctor. But I feel very tired around 4 in the afternoon every day, with heavy thirst and needing to pass urine more often."),
    
    # --- Part 6: Lifestyle, Diet & Habits ---
    ("Doctor", "Frequent urination and excessive thirst are classic signs of elevated blood glucose. Tell me about your daily diet. Are you having white rice for both lunch and dinner?"),
    ("Patient", "Yes, Doctor. In our family, lunch is always white rice with sambar or rasam, and for dinner also usually rice or three dosas with coconut chutney. Evening tea with two spoons of sugar and biscuits."),
    ("Doctor", "That explains the higher glycemic load. Refined carbohydrates like white rice and dosas cause steep sugar spikes. We will need to transition your diet toward whole grains, millets, chapati, and much more green vegetables, protein like dal or paneer, and cut out table sugar."),
    ("Patient", "Understood, Doctor. I will follow whatever diet chart you give. I really want this burning in my feet to go away."),
    ("Doctor", "Do you smoke, chew tobacco, or consume alcohol?"),
    ("Patient", "No tobacco at all, Doctor. Alcohol I drink occasionally, maybe once a month at social functions, two beers at most."),
    
    # --- Part 7: Physical Examination ---
    ("Doctor", "That is fine. Now, let us proceed to the examination couch. First, I am going to check your vital signs."),
    ("Patient", "Sure, Doctor."),
    ("Doctor", "Your blood pressure today is 142 over 88 millimeters of mercury. Pulse is 76 beats per minute, regular rhythm. Oxygen saturation is 98 percent on room air. Temperature is 98.4 Fahrenheit, normal."),
    ("Patient", "Is 142 over 88 too high, Doctor?"),
    ("Doctor", "It is stage 1 hypertension, higher than our diabetic target of under 130 over 80. Now, please take off your socks and shoes. Let me examine both your feet."),
    ("Patient", "Here you go, Doctor."),
    ("Doctor", "Looking at the skin: no active ulcers or calluses, but significant xerosis, dry cracked skin on both heels. Both dorsalis pedis pulses and posterior tibial pulses are palpable and equal."),
    ("Patient", "That is a relief, Doctor."),
    ("Doctor", "Now I am testing with this 10-gram Semmes-Weinstein monofilament wire. Tell me 'yes' every time you feel me touch your foot with it. Close your eyes please."),
    ("Patient", "... Yes ... Yes ... No, I did not feel anything on the great toe ... Yes on the heel."),
    ("Doctor", "You have reduced sensation over the first and third metatarsal heads and the great toe bilaterally. Testing with the 128 Hertz tuning fork: vibration sense is also reduced at both medial malleoli, lasting only 4 seconds."),
    ("Patient", "Does that mean my nerves are permanently damaged, Doctor?"),
    ("Doctor", "It confirms early Diabetic Sensorimotor Polyneuropathy. The good news is that by strictly controlling your blood sugar, improving microvascular circulation, and starting neuro-protective medications, we can arrest the progression and significantly relieve the burning symptoms."),
    
    # --- Part 8: Investigations & Clinical Plan ---
    ("Patient", "Doctor, what tests do we need to do today?"),
    ("Doctor", "We need a comprehensive metabolic panel: fasting blood glucose, post-prandial blood sugar, HbA1c, fasting lipid profile, serum creatinine, electrolytes, and a spot urine microalbumin to creatinine ratio to check kidney filtration."),
    ("Patient", "Will do all of them at the lab right now, Doctor."),
    ("Doctor", "Excellent. Now regarding your medications: for diabetes, we will step up Metformin to 1000 mg sustained release twice daily, or switch to Glycomet-GP1 in the morning after we see your lab results. For the blood pressure, since it is 142 over 88, we will combine Telma with Amlodipine, so Telma-AM 40/5 once daily in the morning."),
    ("Patient", "And for the burning pain in my feet, Doctor? That is the most painful thing at night."),
    ("Doctor", "For the neuropathic pain, I am prescribing a combination of Pregabalin 75 mg with Methylcobalamin 1500 micrograms, to be taken once daily at bedtime. This calms the hyperactive nerve signals and allows you to sleep peacefully."),
    ("Patient", "Will it cause daytime sleepiness?"),
    ("Doctor", "Because you take it right before sleeping, the mild drowsiness actually helps you get sound rest. By morning, you should feel refreshed. For the acidity, take Pantocid 40 mg once daily, strictly 30 minutes before breakfast on an empty stomach for two weeks."),
    
    # --- Part 9: Diabetic Foot Care Counseling & Follow-up ---
    ("Doctor", "Now, three crucial foot care rules: First, inspect the bottom of both feet every night with a mirror for any small cuts, blisters, or reddened spots. Second, never walk barefoot, even inside your house. Always wear soft, supportive indoor slippers. Third, moisturize your feet daily with a urea-based cream, but do not apply cream between the toes."),
    ("Patient", "I understand, Doctor. No barefoot walking and daily checking."),
    ("Doctor", "If you ever notice any cut that doesn't heal, localized redness, heat, swelling, or pus, come to the clinic immediately. Otherwise, please complete the blood tests today, start the new prescriptions tonight, and come see me in three weeks with your updated lab reports."),
    ("Patient", "Thank you so much, Dr. Rao! You explained everything so clearly. I feel much more confident now."),
    ("Doctor", "You are very welcome, Mr. Senthil. Take care, follow the diet plan, and we will get your numbers back to normal. Have a great day."),
    ("Patient", "Thank you, Doctor. Have a good day.")
]


async def synthesize_turn(text: str, voice: str, output_path: str):
    """Synthesize a single turn via edge-tts."""
    import edge_tts
    communicate = edge_tts.Communicate(text=text, voice=voice)
    await communicate.save(output_path)


def generate_audio(duration_target_mins: int = 20):
    """Generate the full multi-turn consultation audio."""
    import edge_tts  # verify import
    
    # Create output directory
    output_dir = Path("test_data")
    output_dir.mkdir(exist_ok=True, parents=True)
    
    # Determine turns to use based on target duration
    # Full script (~1,800 spoken words + natural pauses) expands into ~15-20 min encounter.
    # If duration_target_mins < 10, use first 15 turns.
    turns = CLINICAL_SCRIPT if duration_target_mins >= 15 else CLINICAL_SCRIPT[:16]
    
    print(f"\n===========================================================================")
    print(f"🎙️ GENERATING {duration_target_mins}-MIN CLINICAL ENCOUNTER AUDIO BENCHMARK")
    print(f"===========================================================================")
    print(f"Doctor Voice  : {VOICE_DOCTOR} (Dr. Arvind Rao)")
    print(f"Patient Voice : {VOICE_PATIENT} (Mr. Senthil Kumar)")
    print(f"Total Dialogue Turns: {len(turns)}")
    print(f"Target Output : {output_dir / 'clinical_encounter_20min.wav'}\n")

    # 1. Save reference transcript
    transcript_file = output_dir / f"clinical_encounter_{duration_target_mins}min_transcript.txt"
    with open(transcript_file, "w", encoding="utf-8") as f:
        f.write(f"CLINICAL CONSULTATION REFERENCE TRANSCRIPT ({duration_target_mins} MIN ENCOUNTER)\n")
        f.write("Doctor: Dr. Arvind Rao | Patient: Mr. Senthil Kumar (52M)\n")
        f.write("Clinical Focus: T2DM, Diabetic Peripheral Neuropathy, Stage 1 HTN, GERD\n")
        f.write("=" * 75 + "\n\n")
        for speaker, text in turns:
            f.write(f"[{speaker.upper()}]: {text}\n\n")
    print(f"✅ Reference transcript saved to: {transcript_file}")

    # 2. Synthesize each turn into temp mp3 files
    temp_dir = Path(tempfile.mkdtemp(prefix="voicescribe_tts_"))
    turn_files = []
    
    try:
        print(f"\n[1/3] Synthesizing {len(turns)} audio turns with neural voices...")
        for i, (speaker, text) in enumerate(turns):
            voice = VOICE_DOCTOR if speaker == "Doctor" else VOICE_PATIENT
            turn_path = temp_dir / f"turn_{i:03d}.mp3"
            print(f"  [{i+1}/{len(turns)}] {speaker}: \"{text[:45]}...\"")
            asyncio.run(synthesize_turn(text, voice, str(turn_path)))
            turn_files.append(turn_path)

        # 3. Create ffmpeg concat list with 0.8s silence between turns
        print("\n[2/3] Adding natural conversational pauses and stitching...")
        silence_file = temp_dir / "silence.mp3"
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
            "-t", "0.8", "-q:a", "9", "-acodec", "libmp3lame", str(silence_file)
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        concat_list = temp_dir / "concat_list.txt"
        with open(concat_list, "w", encoding="utf-8") as f:
            for turn_file in turn_files:
                f.write(f"file '{turn_file.name}'\n")
                f.write(f"file '{silence_file.name}'\n")

        # 4. Concatenate and convert to 16kHz mono WAV (Whisper & Gemini medical standard)
        out_wav = output_dir / f"clinical_encounter_{duration_target_mins}min.wav"
        out_mp3 = output_dir / f"clinical_encounter_{duration_target_mins}min.mp3"
        
        print("\n[3/3] Encoding master audio files (16kHz Mono WAV & MP3)...")
        # WAV output (optimal for ASR engines)
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(out_wav)
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        # MP3 output (compact for sharing/mobile testing)
        subprocess.run([
            "ffmpeg", "-y", "-i", str(out_wav),
            "-b:a", "64k", str(out_mp3)
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        # Get total duration
        probe = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(out_wav)
        ], capture_output=True, text=True)
        total_seconds = float(probe.stdout.strip())
        minutes = int(total_seconds // 60)
        seconds = int(total_seconds % 60)

        wav_mb = out_wav.stat().st_size / (1024 * 1024)
        mp3_mb = out_mp3.stat().st_size / (1024 * 1024)

        print("\n" + "=" * 75)
        print(f"🎉 AUDIO BENCHMARK READY!")
        print(f"⏱️ Exact Duration : {minutes} minutes {seconds} seconds ({total_seconds:.1f}s)")
        print(f"📁 Master WAV    : {out_wav} ({wav_mb:.1f} MB)")
        print(f"📁 Portable MP3  : {out_mp3} ({mp3_mb:.1f} MB)")
        print(f"📄 Full Script   : {transcript_file}")
        print("=" * 75 + "\n")
        
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate realistic clinical audio benchmark")
    parser.add_argument("--duration", type=int, default=20, help="Target duration in minutes (5 or 20)")
    args = parser.parse_args()
    generate_audio(args.duration)
