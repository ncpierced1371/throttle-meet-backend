import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('routes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.text('description');
    table.uuid('creator_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Route characteristics
    table.float('total_distance').defaultTo(0);
    table.integer('estimated_duration').defaultTo(0); // in seconds
    table.enum('difficulty_level', ['easy', 'moderate', 'challenging', 'extreme']).defaultTo('easy');
    table.enum('road_type', ['highway', 'backroads', 'city', 'mountain', 'coastal', 'mixed']).defaultTo('mixed');
    table.integer('scenic_rating').defaultTo(3); // 1-5 stars
    
    // Route metadata
    table.boolean('is_public').defaultTo(true);
    table.boolean('requires_permission').defaultTo(false);
    
    // Navigation data
    table.string('start_location_name');
    table.string('end_location_name');
    table.float('start_latitude');
    table.float('start_longitude');
    table.float('end_latitude');
    table.float('end_longitude');
    
    // Cost estimation
    table.decimal('estimated_fuel_cost', 10, 2);
    table.decimal('estimated_toll_cost', 10, 2);
    table.string('currency').defaultTo('USD');
    
    // Route data
    table.jsonb('waypoints'); // Array of waypoint objects
    table.text('encoded_polyline'); // Google Polyline encoded route
    
    // Statistics
    table.integer('view_count').defaultTo(0);
    table.integer('completion_count').defaultTo(0);
    table.float('average_rating').defaultTo(0);
    table.integer('rating_count').defaultTo(0);
    
    // Timestamps
    table.timestamps(true, true);
    
    // Indexes
    table.index(['creator_id']);
    table.index(['difficulty_level']);
    table.index(['road_type']);
    table.index(['is_public']);
    table.index(['start_latitude', 'start_longitude']);
    table.index(['end_latitude', 'end_longitude']);
    table.index(['average_rating']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('routes');
}