import fs from 'fs';
import path from 'path';
import type { WriteStream } from 'fs';
import type { Logger, LogLevel } from '../types';

const LOG_DIR = path.resolve(__dirname, '..', '..', 'data', 'logs');

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ts(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let currentDay: string | null = null;
let currentStream: WriteStream | null = null;

function getStream(): WriteStream {
  const today = dateKey();
  if (today !== currentDay) {
    if (currentStream) {
      try {
        currentStream.end();
      } catch {}
    }
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const stream = fs.createWriteStream(path.join(LOG_DIR, `${today}.log`), { flags: 'a' });
    stream.on('error', () => {});
    currentStream = stream;
    currentDay = today;
  }
  return currentStream as WriteStream;
}

function stringify(v: unknown): string {
  if (v instanceof Error) return v.stack ?? v.message;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function format(level: LogLevel, prefix: string, args: unknown[]): string {
  const text = args.map(stringify).join(' ');
  return `[${ts()}] [${level}] [${prefix}] ${text}`;
}

function write(level: LogLevel, prefix: string, args: unknown[]): void {
  const line = format(level, prefix, args);
  if (level === 'ERROR' || level === 'WARN') {
    console.error(line);
  } else {
    console.log(line);
  }
  try {
    getStream().write(line + '\n');
  } catch {}
}

export function make(prefix: string): Logger {
  return {
    info: (...a: unknown[]) => write('INFO', prefix, a),
    warn: (...a: unknown[]) => write('WARN', prefix, a),
    error: (...a: unknown[]) => write('ERROR', prefix, a),
    ok: (...a: unknown[]) => write('OK', prefix, a),
  };
}
