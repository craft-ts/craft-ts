const brandAngularDepsMatch = require('./brand-angular-deps-match.cjs');
const noAngularInject = require('./no-angular-inject.cjs');

module.exports = {
  rules: {
    'brand-angular-deps-match': brandAngularDepsMatch,
    'no-angular-inject': noAngularInject,
  },
};
