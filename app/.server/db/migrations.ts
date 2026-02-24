import type { DbType } from "./adapter";

export function getMigrationSQL(dbType: DbType): string[] {
  const autoTs = dbType === "sqlite"
    ? "TEXT NOT NULL DEFAULT (datetime('now'))"
    : "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP";
  const autoTsNullable = dbType === "sqlite" ? "TEXT" : "DATETIME NULL";
  const intBool = "INTEGER";
  const textType = "TEXT";
  const intType = "INTEGER";

  return [
    `CREATE TABLE IF NOT EXISTS users (
      id ${textType} PRIMARY KEY,
      email ${textType} NOT NULL UNIQUE,
      username ${textType} UNIQUE,
      password_hash ${textType} NOT NULL,
      created_at ${autoTs},
      last_sign_in_at ${autoTsNullable}
    )`,
    `CREATE TABLE IF NOT EXISTS uploads (
      id ${textType} PRIMARY KEY,
      user_id ${textType} NOT NULL,
      file_name ${textType} NOT NULL,
      original_name ${textType} NOT NULL,
      mime_type ${textType} NOT NULL,
      file_size ${intType} NOT NULL,
      file_path ${textType} NOT NULL,
      thumbnail_path ${textType},
      preview_path ${textType},
      is_public ${intBool} NOT NULL DEFAULT 1,
      views ${intType} NOT NULL DEFAULT 0,
      created_at ${autoTs},
      updated_at ${autoTs},
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS tags (
      id ${textType} PRIMARY KEY,
      name ${textType} NOT NULL,
      user_id ${textType} NOT NULL,
      created_at ${autoTs},
      UNIQUE(name, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS upload_tags (
      upload_id ${textType} NOT NULL,
      tag_id ${textType} NOT NULL,
      PRIMARY KEY (upload_id, tag_id),
      FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS api_tokens (
      id ${textType} PRIMARY KEY,
      user_id ${textType} NOT NULL,
      token ${textType} NOT NULL UNIQUE,
      name ${textType} NOT NULL,
      last_used_at ${autoTsNullable},
      created_at ${autoTs},
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_settings (
      id ${textType} PRIMARY KEY,
      user_id ${textType} NOT NULL UNIQUE,
      disk_quota ${intType} NOT NULL DEFAULT 1073741824,
      disk_used ${intType} NOT NULL DEFAULT 0,
      default_public ${intBool} NOT NULL DEFAULT 1,
      embed_title ${textType} NOT NULL DEFAULT 'File Upload',
      embed_description ${textType},
      embed_color ${textType} NOT NULL DEFAULT '#f97316',
      is_admin ${intBool} NOT NULL DEFAULT 0,
      is_active ${intBool} NOT NULL DEFAULT 1,
      custom_css ${textType},
      max_upload_size ${intType} NOT NULL DEFAULT 104857600,
      custom_path ${textType},
      created_at ${autoTs},
      updated_at ${autoTs},
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS system_settings (
      id ${textType} PRIMARY KEY,
      site_name ${textType} NOT NULL DEFAULT 'RXShare',
      site_description ${textType} NOT NULL DEFAULT 'Simple file sharing',
      allow_registration ${intBool} NOT NULL DEFAULT 1,
      allow_login ${intBool} NOT NULL DEFAULT 1,
      allow_email ${intBool} NOT NULL DEFAULT 1,
      default_quota ${intType} NOT NULL DEFAULT 1073741824,
      max_upload_size ${intType} NOT NULL DEFAULT 104857600,
      primary_color ${textType} NOT NULL DEFAULT '#f97316',
      accent_color ${textType} NOT NULL DEFAULT '#ea580c',
      base_url ${textType},
      dashboard_layout ${textType} NOT NULL DEFAULT 'header',
      logo_url ${textType},
      created_at ${autoTs},
      updated_at ${autoTs}
    )`,
  ];
}

export function getIndexSQL(): string[] {
  return [
    "CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_uploads_is_public ON uploads(is_public)",
    "CREATE INDEX IF NOT EXISTS idx_uploads_file_name ON uploads(file_name)",
    "CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token)",
    "CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
  ];
}

export function getMigrationUpdates(): string[] {
  return [
    "ALTER TABLE uploads ADD COLUMN preview_path TEXT",
    "ALTER TABLE system_settings ADD COLUMN dashboard_layout TEXT NOT NULL DEFAULT 'header'",
    "ALTER TABLE system_settings ADD COLUMN logo_url TEXT",
    "ALTER TABLE system_settings ADD COLUMN background_pattern TEXT NOT NULL DEFAULT 'grid'",
    "ALTER TABLE uploads ADD COLUMN downloads INTEGER NOT NULL DEFAULT 0",
  ];
}
