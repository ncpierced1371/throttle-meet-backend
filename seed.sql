-- Sample data for ThrottleMeet
SET search_path TO throttlemeet;

-- USERS
INSERT INTO users (email, display_name, auth_provider, car_make, car_model, car_year, bio, location)
VALUES
('alice@example.com', 'Alice', 'apple', 'BMW', 'M3', 2020, 'Track enthusiast', ST_MakePoint(-118.2437,34.0522)),
('bob@example.com', 'Bob', 'facebook', 'Porsche', '911', 2018, 'Loves canyon drives', ST_MakePoint(-118.6059,34.1486)),
('carol@example.com', 'Carol', 'email', 'Tesla', 'Model S', 2022, 'EV fan', ST_MakePoint(-122.4194,37.7749));

-- EVENTS
INSERT INTO events (title, description, rally_type, start_date, location, max_participants, organizer_id)
VALUES
('Cars & Coffee LA', 'Weekly meetup for car lovers', 'cars_and_coffee', '2025-09-15 08:00', ST_MakePoint(-118.2437,34.0522), 100, 1),
('Track Day Willow Springs', 'High-performance driving event', 'track_day', '2025-09-20 09:00', ST_MakePoint(-118.2551,34.8153), 50, 2);

-- ROUTES
INSERT INTO routes (name, description, category, difficulty, creator_id, path)
VALUES
('PCH Scenic Drive', 'Pacific Coast Highway route', 'coastal', 'beginner', 1, ST_GeomFromText('LINESTRING(-118.4912 34.0194, -119.6816 34.4208)',4326)),
('Angeles Crest Run', 'Mountain twisties', 'mountain', 'advanced', 2, ST_GeomFromText('LINESTRING(-118.2437 34.0522, -117.8653 34.2361)',4326));

-- ROUTE WAYPOINTS
INSERT INTO route_waypoints (route_id, name, description, waypoint_order, lat, lng, type, location)
VALUES
(1, 'Start - Santa Monica', 'PCH start point', 1, 34.0194, -118.4912, 'start', ST_MakePoint(-118.4912,34.0194)),
(1, 'End - Santa Barbara', 'PCH end point', 2, 34.4208, -119.6816, 'end', ST_MakePoint(-119.6816,34.4208)),
(2, 'Start - LA', 'Angeles Crest start', 1, 34.0522, -118.2437, 'start', ST_MakePoint(-118.2437,34.0522)),
(2, 'End - La Canada', 'Angeles Crest end', 2, 34.2361, -117.8653, 'end', ST_MakePoint(-117.8653,34.2361));

-- SOCIAL POSTS
INSERT INTO social_posts (user_id, type, content, hashtags, media, event_id, route_id, location)
VALUES
(1, 'photo', 'BMW M3 at PCH', ARRAY['#BMW','#PCH'], ARRAY['https://images.com/bmw.jpg'], 1, 1, ST_MakePoint(-118.4912,34.0194)),
(2, 'text', '911 ready for track day!', ARRAY['#Porsche','#TrackDay'], ARRAY[]::TEXT[], 2, NULL, ST_MakePoint(-118.2551,34.8153));

-- GROUPS
INSERT INTO groups (name, description, owner_id)
VALUES
('LA Track Club', 'Group for LA track enthusiasts', 1),
('EV Owners', 'Electric vehicle fans', 3);

-- GROUP MEMBERSHIPS
INSERT INTO group_memberships (group_id, user_id)
VALUES
(1, 1), (1, 2), (2, 3);

-- EVENT REGISTRATIONS
INSERT INTO event_registrations (event_id, user_id, car_make, car_model, car_year, emergency_contact, status)
VALUES
(1, 1, 'BMW', 'M3', 2020, '555-1234', 'confirmed'),
(2, 2, 'Porsche', '911', 2018, '555-5678', 'confirmed');

-- ROUTE RATINGS
INSERT INTO route_ratings (route_id, user_id, rating, review, safety, car_type)
VALUES
(1, 1, 5, 'Amazing views!', 5, 'sports'),
(2, 2, 4, 'Challenging drive', 4, 'sports');

-- ACHIEVEMENTS
INSERT INTO achievements (user_id, title, description)
VALUES
(1, '1000 Miles Driven', 'Completed 1000 miles on ThrottleMeet routes'),
(2, 'Track Day Winner', 'Fastest lap at Willow Springs');

-- NOTIFICATIONS
INSERT INTO notifications (user_id, type, content)
VALUES
(1, 'event', 'You are registered for Cars & Coffee LA'),
(2, 'achievement', 'Track Day Winner!');

-- ADMIN USERS
INSERT INTO admin_users (email, password, role)
VALUES
('admin@throttlemeet.com', 'securepassword', 'admin');

-- MODERATION LOGS
INSERT INTO moderation_logs (admin_id, action, target_type, target_id, details)
VALUES
(1, 'delete', 'post', 2, 'Removed inappropriate content');
