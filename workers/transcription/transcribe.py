#!/usr/bin/env python3
import argparse
import json
import math
import sys
import time
from pathlib import Path


def emit_log(message, **fields):
    payload = {"message": message, **fields}
    print(json.dumps(payload, ensure_ascii=True), file=sys.stderr, flush=True)


def emit_progress(progress, message):
    payload = {"progress": progress, "message": message}
    print(f"PROGRESS {json.dumps(payload, ensure_ascii=True)}", file=sys.stderr, flush=True)


def confidence_from_avg_logprob(avg_logprob):
    if avg_logprob is None:
        return None

    try:
        return max(0.0, min(1.0, math.exp(float(avg_logprob))))
    except (TypeError, ValueError, OverflowError):
        return None


def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe one audio file with faster-whisper.")
    parser.add_argument("audio_path", help="Absolute or relative path to the audio file.")
    parser.add_argument("--model", default="small", help="faster-whisper model size or local model path.")
    parser.add_argument("--language", default="fr", help="Language code, or 'auto' for detection.")
    parser.add_argument("--device", default="cpu", help="faster-whisper device, e.g. cpu, cuda, auto.")
    parser.add_argument("--compute-type", default="int8", help="faster-whisper compute type, e.g. int8, float16.")
    parser.add_argument("--beam-size", type=int, default=5)
    return parser.parse_args()


def main():
    args = parse_args()
    audio_path = Path(args.audio_path).expanduser().resolve()

    if not audio_path.exists():
      raise FileNotFoundError(f"Audio file not found: {audio_path}")

    started_at = time.time()
    emit_log(
        "local transcription started",
        audioPath=str(audio_path),
        model=args.model,
        language=args.language,
        device=args.device,
        computeType=args.compute_type,
    )
    emit_progress(5, "loading model")

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper is not installed. Run: python3 -m pip install -r workers/transcription/requirements.txt"
        ) from exc

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    emit_progress(10, "model loaded")

    language = None if args.language.lower() == "auto" else args.language
    segments_iter, info = model.transcribe(
        str(audio_path),
        language=language,
        beam_size=args.beam_size,
        vad_filter=True,
    )

    duration = float(getattr(info, "duration", 0.0) or 0.0)
    detected_language = getattr(info, "language", None)
    emit_log("transcription running", duration=duration, detectedLanguage=detected_language)

    segments = []
    text_parts = []

    for segment in segments_iter:
        text = (segment.text or "").strip()
        if not text:
            continue

        avg_logprob = getattr(segment, "avg_logprob", None)
        no_speech_prob = getattr(segment, "no_speech_prob", None)

        segment_payload = {
            "startTime": float(segment.start),
            "endTime": float(segment.end),
            "text": text,
            "confidence": confidence_from_avg_logprob(avg_logprob),
            "avgLogProb": avg_logprob,
            "noSpeechProb": no_speech_prob,
        }
        segments.append(segment_payload)
        text_parts.append(text)

        if duration > 0:
            progress = min(95, max(10, round((float(segment.end) / duration) * 95)))
            emit_progress(progress, f"segment {len(segments)}")

    result = {
        "provider": "local",
        "model": args.model,
        "language": detected_language,
        "duration": duration,
        "elapsedSeconds": round(time.time() - started_at, 3),
        "rawText": "\n".join(text_parts),
        "segments": segments,
    }

    emit_log(
        "local transcription finished",
        segments=len(segments),
        elapsedSeconds=result["elapsedSeconds"],
    )
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit_log("local transcription failed", error=str(exc))
        print(json.dumps({"error": str(exc)}, ensure_ascii=True), file=sys.stderr, flush=True)
        sys.exit(1)
