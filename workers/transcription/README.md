# Local transcription worker

This worker transcribes one audio file with `faster-whisper` and prints JSON to stdout.
It does not read or write the application database.

## Install

```bash
cd /Users/momo/Documents/Projets/studio-app
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r workers/transcription/requirements.txt
```

## Test

```bash
source .venv/bin/activate
python3 workers/transcription/transcribe.py storage_uploads/example.m4a --model small --language fr
```

The script writes progress logs to stderr and the final transcription JSON to stdout.
