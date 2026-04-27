const { run } = require('../src/pipeline/dispatch');

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
