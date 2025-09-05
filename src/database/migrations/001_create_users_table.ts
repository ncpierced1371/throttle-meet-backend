import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').unique().notNullable();
    table.string('display_name').notNullable();
    table.string('first_name');
    table.string('last_name');
    table.string('profile_image_url');
    table.text('bio');
    
    // Authentication providers
    table.string('auth_provider').notNullable();
    table.string('apple_user_id').unique();
    table.string('facebook_user_id').unique();
    table.boolean('is_facebook_linked').defaultTo(false);
    table.boolean('email_verified').defaultTo(false);
    
    // Car information
    table.string('car_make');
    table.string('car_model');
    table.integer('car_year');
    table.string('car_color');
    
    // User type and preferences
    table.string('user_type');
    table.specificType('automotive_interests', 'text[]').defaultTo('{}');
    table.integer('achievement_points').defaultTo(0);
    
    // Preferences
    table.enum('preferred_units', ['imperial', 'metric']).defaultTo('imperial');
    table.enum('privacy_level', ['private', 'friends', 'public']).defaultTo('friends');
    table.boolean('share_location').defaultTo(false);
    table.float('location_radius').defaultTo(50.0);
    
    // Timestamps
    table.timestamps(true, true);
    table.timestamp('last_active_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['email']);
    table.index(['apple_user_id']);
    table.index(['facebook_user_id']);
    table.index(['auth_provider']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('users');
}