const brandAngularDepsMatch = require('./brand-angular-deps-match.cjs');
const noAngularInject = require('./no-angular-inject.cjs');
const noDirectAngularClassExport = require('./no-direct-angular-class-export.cjs');

module.exports = {
  rules: {
    'brand-angular-deps-match': brandAngularDepsMatch,
    'no-angular-inject': noAngularInject,
    'no-direct-angular-class-export': noDirectAngularClassExport,
  },
};
