# Studio App

Studio App transforme des enregistrements audio de freestyle en textes, segments et contenus exploitables pour le travail studio.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Local Transcription With faster-whisper

The V1 transcription mode is local-first and does not require OpenAI.

Recommended `.env` values:

```bash
TRANSCRIPTION_PROVIDER=local
WHISPER_MODEL=small
WHISPER_LANGUAGE=fr
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
TRANSCRIPTION_PYTHON_BIN=python3
```

`TRANSCRIPTION_PROVIDER` can be:

- `local`: default V1 mode, uses the Python `faster-whisper` worker.
- `openai`: optional future mode, requires `OPENAI_API_KEY`.
- `mock`: development/test fallback only.

### Python Install

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r workers/transcription/requirements.txt
```

If you use a virtualenv, set:

```bash
TRANSCRIPTION_PYTHON_BIN=.venv/bin/python
```

### Test The Worker Directly

```bash
source .venv/bin/activate
python3 workers/transcription/transcribe.py storage_uploads/example.m4a --model small --language fr
```

The script writes progress logs to stderr and final JSON to stdout:

- `rawText`
- `segments`
- `startTime`
- `endTime`
- confidence/probability fields when available

### Model Choice

Start with `small` for faster tests on Mac. Use `medium` only if local performance is acceptable.

```bash
WHISPER_MODEL=small
```

### Known Limits

- Very long files can take a long time on CPU.
- First run downloads the selected model.
- `faster-whisper` runs inside the local Python environment, so deployment must include Python dependencies and model storage.
- The Node app owns jobs and database writes; the Python worker only transcribes one file and returns JSON.
