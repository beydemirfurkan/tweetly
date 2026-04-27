const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '..', '..', 'data', 'logs');

function pad(n) {
  return String(n).padStart(2, '0');
}

function ts(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let currentDay = null;
let currentStream = null;

function getStream() {
  const today = dateKey();
  if (today !== currentDay) {
    if (currentStream) {
      try {
        currentStream.end();
      } catch {}
    }
    fs.mkdirSync(LOG_DIR, { recursive: true });
    currentStream = fs.createWriteStream(path.join(LOG_DIR, `${today}.log`), { flags: 'a' });
    currentStream.on('error', () => {});
    currentDay = today;
  }
  return currentStream;
}

function stringify(v) {
  if (v instanceof Error) return v.stack || v.message;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function format(level, prefix, args) {
  const text = args.map(stringify).join(' ');
  return `[${ts()}] [${level}] [${prefix}] ${text}`;
}

function write(level, prefix, args) {
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

function make(prefix) {
  return {
    info: (...a) => write('INFO', prefix, a),
    warn: (...a) => write('WARN', prefix, a),
    error: (...a) => write('ERROR', prefix, a),
    ok: (...a) => write('OK', prefix, a),
  };
}

module.exports = { make };
