import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('title').notNullable();
    table.text('description');
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date');
    table.enum('rally_type', ['trackDay', 'carMeet', 'cruise', 'autoX', 'dragRace', 'socialShare']).notNullable();
    
    // Location
    table.string('venue_name');
    table.string('venue_address');
    table.float('latitude');
    table.float('longitude');
    
    // Capacity and participation
    table.integer('max_participants');
    table.integer('current_participants').defaultTo(0);
    table.boolean('registration_required').defaultTo(false);
    table.timestamp('registration_deadline');
    table.decimal('entry_fee', 10, 2);
    table.string('currency').defaultTo('USD');
    
    // Event details
    table.uuid('organizer_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('cover_image_url');
    table.specificType('additional_images', 'text[]').defaultTo('{}');
    table.specificType('tags', 'text[]').defaultTo('{}');
    table.enum('difficulty', ['easy', 'moderate', 'challenging', 'extreme']);
    table.integer('age_restriction');
    table.specificType('car_requirements', 'text[]').defaultTo('{}');
    
    // Event status and moderation
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_approved').defaultTo(false);
    table.boolean('is_featured').defaultTo(false);
    table.boolean('is_public').defaultTo(true);
    table.boolean('requires_approval').defaultTo(true);
    
    // Metadata and external integration
    table.jsonb('metadata');
    table.string('qr_code_data');
    table.float('check_in_radius').defaultTo(100.0);
    
    // External event integration
    table.string('external_event_id');
    table.string('external_platform');
    table.string('external_url');
    table.boolean('is_imported').defaultTo(false);
    table.string('import_source');
    table.timestamp('last_sync_date');
    
    // Timestamps
    table.timestamps(true, true);
    table.timestamp('published_at');
    
    // Indexes
    table.index(['organizer_id']);
    table.index(['rally_type']);
    table.index(['start_date']);
    table.index(['is_active']);
    table.index(['is_approved']);
    table.index(['is_featured']);
    table.index(['external_event_id']);
    table.index(['latitude', 'longitude']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('events');
}