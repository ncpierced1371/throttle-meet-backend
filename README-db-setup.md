# ThrottleMeet PostgreSQL + PostGIS Setup

## Requirements
- PostgreSQL 13+
- PostGIS extension

## Setup Instructions

1. **Install PostgreSQL and PostGIS**
   - On macOS: `brew install postgresql postgis`
   - On Ubuntu: `sudo apt-get install postgresql postgis`

2. **Create Database and Enable PostGIS**
   ```sh
   createdb throttlemeet
   psql throttlemeet -c "CREATE EXTENSION postgis;"
   ```

3. **Run Schema Migration**
   ```sh
   psql throttlemeet < schema.sql
   ```

4. **Seed Sample Data**
   ```sh
   psql throttlemeet < seed.sql
   ```

5. **Future Migrations**
   - Place migration scripts in the `migrations/` folder
   - Apply with: `psql throttlemeet < migrations/your_migration.sql`

## Environment Variables
- `DATABASE_URL=postgresql://username:password@localhost/throttlemeet`

## Notes
- All tables are in the `throttlemeet` schema
- PostGIS is required for location features
- Sample data includes users, events, routes, posts, groups, etc.
- Use the provided schema for API development
