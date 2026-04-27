const { run } = require('../src/pipeline/collect');

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
