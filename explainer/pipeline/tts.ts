// TTS adapter (spec section 9). Isolates Pocket TTS behind one function.
// Calls the `pocket-tts serve` HTTP server; sequential by design — the model
// is not thread-safe, so callers must never run syntheses in parallel.
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

export type Word = {text: string; start: number; end: number}; // seconds; Pocket TTS gives none
export interface TtsResult {
  file: string;
  durationSec: number;
  words?: Word[];
}

const TTS_URL = process.env.TTS_URL ?? 'http://localhost:8000/tts';
export const DEFAULT_VOICE = 'alba'; // THE narration voice. FINAL per the user (2025-11-17).
// Never change this without the user saying so in a NEW message. Earlier
// 'marius' mentions anywhere in the repo are history, not a default.

export async function synthesize(
  text: string,
  outPath: string,
  opts: {voice?: string} = {},
): Promise<TtsResult> {
  const form = new FormData();
  form.set('text', text);
  form.set('voice_url', opts.voice ?? DEFAULT_VOICE); // built-in voice name
  let res: Response;
  try {
    res = await fetch(TTS_URL, {method: 'POST', body: form});
  } catch (e) {
    throw new Error(
      `TTS request to ${TTS_URL} failed (${(e as Error).message}) - is \`pocket-tts serve\` running?`,
    );
  }
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const rawPath = outPath + '.raw.wav';
  await writeFile(rawPath, Buffer.from(await res.arrayBuffer()));

  // Re-encode: fixes the header of a streamed WAV, resamples 24 kHz to 48 kHz,
  // mono, loudness-normalized (spec steps 2 and 3).
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      rawPath,
      '-af',
      'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ar',
      '48000',
      '-ac',
      '1',
      outPath,
    ],
    {stdio: ['ignore', 'ignore', 'ignore']},
  );
  const {unlinkSync} = await import('node:fs');
  unlinkSync(rawPath); // streamed temp file not needed after re-encode

  // Measure from the re-encoded file: a streamed WAV can carry a placeholder
  // length in its header.
  const d = execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    outPath,
  ],
    {stdio: ['ignore', 'pipe', 'ignore']},
  )
    .toString()
    .trim();
  return {file: outPath, durationSec: parseFloat(d)};
}
