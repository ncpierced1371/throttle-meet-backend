
export interface User {
  id: string;
  email: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
  bio?: string;
  created_at: Date;
  last_active_at: Date;
  auth_provider: string;
  apple_user_id?: string;
  facebook_user_id?: string;
  is_facebook_linked: boolean;
  email_verified: boolean;
  car_make?: string;
  car_model?: string;
  car_year?: number;
  car_color?: string;
  following_count: number;
  follower_count: number;
  post_count: number;
  achievement_points: number;
  is_verified: boolean;
  following_user_ids: string[];
  follower_user_ids: string[];
}

export interface Event {
  id: string;
  title: string;
  description?: string;
  organizer_id: string;
  rally_type: string;
  created_at: Date;
  updated_at: Date;
  start_date?: Date;
  end_date?: Date;
  location_name?: string;
  location_address?: string;
  event_location?: any; // PostGIS geometry
  max_participants?: number;
  current_participants: number;
  entry_fee: number;
  is_public: boolean;
  requires_approval: boolean;
  status: string;
}

export interface Route {
  id: string;
  creator_id: string;
  name: string;
  description?: string;
  created_at: Date;
  difficulty_level: string;
  estimated_duration_minutes?: number;
  total_distance_miles?: number;
  route_path?: any; // PostGIS geometry
  average_rating: number;
  total_ratings: number;
  is_public: boolean;
}

export interface SocialPost {
  id: string;
  author_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
  like_count: number;
  comment_count: number;
  share_count: number;
  image_urls: string[];
  hashtags: string[];
  mentioned_users: string[];
  associated_event_id?: string;
  associated_route_id?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
