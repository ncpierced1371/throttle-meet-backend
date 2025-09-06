const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_8YpFTUDng9Km@ep-jolly-cloud-ad9i63he-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});
client.connect()
  .then(() => console.log('Connected!'))
  .catch(err => console.error('Connection error:', err))
  .finally(() => client.end());
