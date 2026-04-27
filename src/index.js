const cron = require('node-cron');
const collect = require('./pipeline/collect');
const dispatch = require('./pipeline/dispatch');
const { config } = require('./config');
const { make } = require('./utils/logger');

const log = make('orchestrator');

function start() {
  log.info('Başlıyor.');
  log.info(
    `Plan: günde ${config.pipeline.tweetsPerDay} tweet, başlangıç ${config.pipeline.dispatchStartHour}:00, aralık ${config.pipeline.dispatchIntervalMin} dk.`
  );

  cron.schedule(`0 ${config.pipeline.dispatchStartHour} * * *`, async () => {
    log.info('Sabah collect tetiklendi.');
    try {
      await collect.run();
    } catch (err) {
      log.error(`collect hata: ${err.message}`);
    }
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      await dispatch.run();
    } catch (err) {
      log.error(`dispatch hata: ${err.message}`);
    }
  });

  log.ok('Cron'lar kuruldu. Süreç ayakta kalıyor.');
}

if (require.main === module) {
  start();
}

module.exports = { start };
