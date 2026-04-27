function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function make(prefix) {
  return {
    info: (...args) => console.log(`[${ts()}] [${prefix}]`, ...args),
    warn: (...args) => console.warn(`[${ts()}] [${prefix}] ⚠`, ...args),
    error: (...args) => console.error(`[${ts()}] [${prefix}] ✖`, ...args),
    ok: (...args) => console.log(`[${ts()}] [${prefix}] ✅`, ...args),
  };
}

module.exports = { make };
