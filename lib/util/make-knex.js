'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.default = makeKnex;

var _events = require('events');

var _Migrator = _interopRequireDefault(require('../migrate/Migrator'));

var _seed = _interopRequireDefault(require('../seed'));

var _functionhelper = _interopRequireDefault(require('../functionhelper'));

var _methods = _interopRequireDefault(require('../query/methods'));

var _lodash = require('lodash');

var _batchInsert = _interopRequireDefault(require('./batchInsert'));

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

function makeKnex(client) {
  // The object we're potentially using to kick off an initial chain.
  function knex(tableName, options) {
    const qb = knex.queryBuilder();
    if (!tableName)
      client.logger.warn(
        'calling knex without a tableName is deprecated. Use knex.queryBuilder() instead.'
      );
    return tableName ? qb.table(tableName, options) : qb;
  }

  (0, _lodash.assign)(knex, {
    Promise: require('bluebird'),

    // A new query builder instance.
    queryBuilder() {
      return client.queryBuilder();
    },

    raw() {
      return client.raw.apply(client, arguments);
    },

    batchInsert(table, batch, chunkSize = 1000) {
      return (0, _batchInsert.default)(this, table, batch, chunkSize);
    },

    // Runs a new transaction, taking a container and returning a promise
    // for when the transaction is resolved.
    transaction(container, config) {
      const trx = client.transaction(container, config);
      trx.userParams = this.userParams;
      return trx;
    },

    // Typically never needed, initializes the pool for a knex client.
    initialize(config) {
      return client.initializePool(config);
    },

    // Convenience method for tearing down the pool.
    destroy(callback) {
      return client.destroy(callback);
    },

    ref(ref) {
      return client.ref(ref);
    },

    withUserParams(params) {
      const knexClone = shallowCloneFunction(knex); // We need to include getters in our clone

      if (knex.client) {
        knexClone.client = Object.assign({}, knex.client); // Clone client to avoid leaking listeners that are set on it

        const parentPrototype = Object.getPrototypeOf(knex.client);

        if (parentPrototype) {
          Object.setPrototypeOf(knexClone.client, parentPrototype);
        }
      }

      redefineProperties(knexClone);
      knexClone.userParams = params;
      return knexClone;
    },
  }); // Allow chaining methods from the root object, before
  // any other information is specified.

  _methods.default.forEach(function(method) {
    knex[method] = function() {
      const builder = knex.queryBuilder();
      return builder[method].apply(builder, arguments);
    };
  });

  knex.client = client;
  redefineProperties(knex);
  client.makeKnex = makeKnex;
  knex.userParams = {};
  return knex;
}

function redefineProperties(knex) {
  Object.defineProperties(knex, {
    schema: {
      get() {
        return knex.client.schemaBuilder();
      },

      configurable: true,
    },
    migrate: {
      get() {
        return new _Migrator.default(knex);
      },

      configurable: true,
    },
    seed: {
      get() {
        return new _seed.default(knex);
      },

      configurable: true,
    },
    fn: {
      get() {
        return new _functionhelper.default(knex.client);
      },

      configurable: true,
    },
  }); // Hook up the "knex" object as an EventEmitter.

  const ee = new _events.EventEmitter();

  for (const key in ee) {
    knex[key] = ee[key];
  } // Passthrough all "start" and "query" events to the knex object.

  knex.client.on('start', function(obj) {
    knex.emit('start', obj);
  });
  knex.client.on('query', function(obj) {
    knex.emit('query', obj);
  });
  knex.client.on('query-error', function(err, obj) {
    knex.emit('query-error', err, obj);
  });
  knex.client.on('query-response', function(response, obj, builder) {
    knex.emit('query-response', response, obj, builder);
  });
}

function shallowCloneFunction(originalFunction) {
  const clonedFunction = originalFunction.bind(
    Object.create(
      Object.getPrototypeOf(originalFunction),
      Object.getOwnPropertyDescriptors(originalFunction)
    )
  );
  Object.assign(clonedFunction, originalFunction);
  return clonedFunction;
}

module.exports = exports.default;
