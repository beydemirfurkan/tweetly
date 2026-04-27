const { config } = require('../config');
const queue = require('../storage/queue');
const posted = require('../storage/posted');
const postTweet = require('../core/postTweet');
const { make } = require('../utils/logger');

const log = make('dispatch');

let running = false;

async function run() {
  if (running) {
    log.warn('Önceki dispatch hâlâ çalışıyor, atlanıyor.');
    return null;
  }
  running = true;
  try {
    const item = queue.dueNext();
    if (!item) {
      log.info('Vakti gelen tweet yok.');
      return null;
    }

    log.info(`Atılıyor: ${item.repo} (id=${item.id})`);
    try {
      await postTweet(item.text);
      queue.update(item.id, { status: 'sent', sentAt: new Date().toISOString() });
      posted.add(item.repo);
      log.ok(`Atıldı: ${item.repo}`);
      return item;
    } catch (err) {
      const attempts = (item.attempts || 0) + 1;
      const status = attempts >= config.pipeline.maxAttempts ? 'dead' : 'failed';
      queue.update(item.id, {
        status,
        attempts,
        lastError: err.message,
        lastTriedAt: new Date().toISOString(),
      });
      log.error(`Hata (${status}, deneme ${attempts}): ${err.message}`);
      return null;
    }
  } finally {
    running = false;
  }
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run };
