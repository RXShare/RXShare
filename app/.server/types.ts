// Shared data model interfaces for RXShare

export interface User {
  id: string;
  email: string;
  username: string | null;
  password_hash?: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface Upload {
  id: string;
  user_id: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  file_path: string;
  thumbnail_path: string | null;
  preview_path: string | null;
  is_public: number;
  views: number;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  disk_quota: number;
  disk_used: number;
  default_public: number;
  embed_title: string;
  embed_description: string | null;
  embed_color: string;
  is_admin: number;
  is_active: number;
  custom_css: string | null;
  max_upload_size: number;
  custom_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemSettings {
  id: string;
  site_name: string;
  site_description: string;
  allow_registration: number;
  allow_login: number;
  allow_email: number;
  default_quota: number;
  max_upload_size: number;
  primary_color: string;
  accent_color: string;
  base_url: string | null;
  dashboard_layout: string;
  logo_url: string | null;
  background_pattern: string;
  created_at: string;
  updated_at: string;
}

export interface ApiToken {
  id: string;
  user_id: string;
  token: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}
