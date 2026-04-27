const { login } = require('../src/core/login');

login().catch((e) => {
  console.error(e);
  process.exit(1);
});
