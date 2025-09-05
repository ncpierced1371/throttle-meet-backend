const path = require('path');

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: 'localhost',
      port: 5432,
      user: 'jeremy',
      password: '',
      database: 'throttlemeet_dev'
    },
    migrations: {
      directory: './src/database/migrations',
      extension: 'ts'
    },
    seeds: {
      directory: './src/database/seeds',
      extension: 'ts'
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  staging: {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://jeremy:@localhost:5432/throttlemeet_staging',
    migrations: {
      directory: './dist/database/migrations'
    },
    seeds: {
      directory: './dist/database/seeds'
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './dist/database/migrations'
    },
    seeds: {
      directory: './dist/database/seeds'
    },
    pool: {
      min: 2,
      max: 20
    }
  }
};