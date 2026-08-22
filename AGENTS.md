# Project: TwelveLabs Voice Studio (HQ Cluster v11.0)

## 🎯 Project Vision
A high-performance AI voice dubbing and script analysis studio that leverages Google's Gemini Live API for consistent, expressive, and superfast voice synthesis.

---

## 🛠️ Core Architecture
- **Frontend**: Next.js 15 (App Router) + Tailwind CSS + Lucide Icons.
- **Backend**: FastAPI (Python) hosted on Hugging Face (Standard Port: **7860**).
- **Storage**: Cloudflare R2 (S3-compatible) for all audio and analysis assets.
- **Database**: Firebase Realtime Database (for live progress signals) + Firestore (for permanent metadata & user credits).
- **AI Models**: 
  - **Synthesis**: Gemini 3.1 Flash Live (Primary) & Gemini 2.5 Native Audio (Fallback).
  - **Analysis**: DeepSeek (Short Scripts) & Gemini (Long Scripts).
  - **Verification**: Whisper (OpenRouter) with 50% match threshold.

---

## 🏗️ Technical Rules & Constraints

### 1. The "HQ Cluster" Backend Protocol (Python)
- **Port**: Always use port **7860** for the FastAPI/Uvicorn backend.
- **Concurrency**: `MAX_CONCURRENT_PROJECTS` is strictly limited to **5**.
- **Neural Color Engine**: Use the specific ANSI color logging style (OKGREEN, OKCYAN, OKBLUE, etc.) for all system events.
- **Voice Consistency**: Use `gemini-3.1-flash-live-preview` as the primary engine to ensure consistent character voices across sessions.
- **Verification Loop**: 
  - All synthesized clips should be verified using Whisper via OpenRouter.
  - Apply the "Read, Don't Reply" baseline instructions (`WHISPER_BASELINE_NOTES`) to prevent the model from "answering" the script.
- **Merging**: Consecutive dialogues from the same character should be merged into a single synthesis group (joined with a 0.8s silence gap) for natural flow.

### 2. Script Analysis & Voice Assignment
- **Normalization**: Strip animation/production markup (e.g., [Camera pans left]) but keep narration.
- **Auto-Assignment**: Voices must be auto-assigned based on gender and ageGroup inference during the analysis phase using the defined `VOICE_GENDER_MAP`.
- **Cost Estimation**: 1 credit per character of dialogue text. Analysis itself is free.

### 3. Frontend & UI (Next.js)
- **UI Archetype**: Futuristic Dark Theme (Dark Gray #212121) with Deep Blue (#1A237E) and Purple (#9C27B0) accents.
- **Typography**: 'Inter' for body, 'Pacifico' for headlines/branding.
- **Real-time Progress**: The UI must listen to the Firebase RTDB `pending_projects` path for live node completion signals (processed_dialogues vs rejected_nodes).
- **Audio Delivery**: Audio is delivered via a single merged MP3 file stored on R2, with a `timeline` object for per-dialogue synchronization.

### 4. Integration Guidelines
- **API Keys**: All sensitive keys (GEMINI_KEYS, OPENROUTER_API_KEY, R2_SECRET, etc.) must stay server-side.
- **Firebase**: Use `X-API-Key` header for customer-level identity in the script analysis API.

---

## 🚨 Critical Failures to Avoid
- **NEVER** allow the AI Voice Actor to "reply" to a script line (e.g., answering a question in the script instead of reading it).
- **NEVER** exceed the 5-project concurrency limit on the backend to avoid IP throttling.
- **NEVER** use port 7861; always stay on **7860**.
- **NEVER** expose the `GEMINI_API_KEY` to the client-side.
