-- ThrottleMeet PostgreSQL Schema (with PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS throttlemeet;
SET search_path TO throttlemeet;

-- USERS
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  display_name VARCHAR(100) NOT NULL,
  auth_provider VARCHAR(50),
  apple_user_id VARCHAR(255) UNIQUE,
  facebook_user_id VARCHAR(255) UNIQUE,
  profile_image_url TEXT,
  car_make VARCHAR(50),
  car_model VARCHAR(50),
  car_year INT,
  interests TEXT[],
  bio TEXT,
  location GEOGRAPHY(POINT,4326),
  followers JSONB DEFAULT '[]',
  following JSONB DEFAULT '[]',
  achievements JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX users_location_gist ON users USING GIST(location);

-- EVENTS
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  rally_type VARCHAR(50),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  location GEOGRAPHY(POINT,4326) NOT NULL,
  max_participants INT,
  requirements JSONB DEFAULT '{}',
  organizer_id INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX events_location_gist ON events USING GIST(location);

-- EVENT REGISTRATIONS
CREATE TABLE event_registrations (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  car_make VARCHAR(50),
  car_model VARCHAR(50),
  car_year INT,
  emergency_contact VARCHAR(100),
  requirements JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  registered_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX event_registrations_event_id_idx ON event_registrations(event_id);
CREATE INDEX event_registrations_user_id_idx ON event_registrations(user_id);

-- ROUTES
CREATE TABLE routes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  difficulty VARCHAR(20),
  surface VARCHAR(20),
  season VARCHAR(20),
  traffic VARCHAR(20),
  creator_id INT REFERENCES users(id) ON DELETE CASCADE,
  path GEOMETRY(LINESTRING,4326) NOT NULL,
  average_rating FLOAT DEFAULT 0,
  review_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX routes_path_gist ON routes USING GIST(path);

-- ROUTE WAYPOINTS
CREATE TABLE route_waypoints (
  id SERIAL PRIMARY KEY,
  route_id INT REFERENCES routes(id) ON DELETE CASCADE,
  name VARCHAR(100),
  description TEXT,
  waypoint_order INT,
  lat FLOAT,
  lng FLOAT,
  type VARCHAR(20),
  location GEOGRAPHY(POINT,4326),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX route_waypoints_location_gist ON route_waypoints USING GIST(location);

-- ROUTE RATINGS
CREATE TABLE route_ratings (
  id SERIAL PRIMARY KEY,
  route_id INT REFERENCES routes(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  safety INT,
  car_type VARCHAR(50),
  photos TEXT[],
  best_time VARCHAR(50),
  season VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX route_ratings_route_id_idx ON route_ratings(route_id);

-- SOCIAL POSTS
CREATE TABLE social_posts (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20),
  content TEXT,
  hashtags TEXT[],
  media TEXT[],
  event_id INT REFERENCES events(id) ON DELETE SET NULL,
  route_id INT REFERENCES routes(id) ON DELETE SET NULL,
  car_id INT,
  location GEOGRAPHY(POINT,4326),
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  saved_by JSONB DEFAULT '[]',
  reports JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX social_posts_location_gist ON social_posts USING GIST(location);

-- COMMENTS
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INT REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  parent_id INT REFERENCES comments(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX comments_post_id_idx ON comments(post_id);

-- GROUPS
CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  owner_id INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- GROUP MEMBERSHIPS
CREATE TABLE group_memberships (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW()
);

-- ACHIEVEMENTS
CREATE TABLE achievements (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(100),
  description TEXT,
  achieved_at TIMESTAMP DEFAULT NOW()
);

-- NOTIFICATIONS
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50),
  content TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ADMIN/MODERATION
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE moderation_logs (
  id SERIAL PRIMARY KEY,
  admin_id INT REFERENCES admin_users(id) ON DELETE CASCADE,
  action VARCHAR(100),
  target_type VARCHAR(50),
  target_id INT,
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- INDEXES & CONSTRAINTS
-- Add more as needed for performance
