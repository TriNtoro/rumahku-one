-- =====================================================================
-- RUMAHKU-ONE : Skema PostgreSQL 16+ (draft v0.1)
-- Kunci tenant tunggal: workspace_id. Uang = bigint minor unit.
-- Waktu = timestamptz (UTC) + tzid IANA bila perlu semantik lokal.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS app;

-- ---------- Helper tenant (dipakai RLS) ----------
CREATE OR REPLACE FUNCTION app.current_workspace_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); NEW.version = COALESCE(OLD.version, 0) + 1; RETURN NEW; END $$;

-- ---------- 1. IDENTITAS & TENANT ----------
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text,                       -- argon2id; NULL jika passkey-only
  locale text NOT NULL DEFAULT 'id-ID',
  tzid text NOT NULL DEFAULT 'Asia/Jakarta',
  totp_secret_enc bytea,
  totp_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','disabled')),
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id bytea NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  sign_count bigint NOT NULL DEFAULT 0,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,         -- hash token; token asli tak disimpan
  device_label text,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'household' CHECK (kind IN ('household','personal','couple')),
  name text NOT NULL,
  base_currency char(3) NOT NULL DEFAULT 'IDR',
  tzid text NOT NULL DEFAULT 'Asia/Jakarta',
  week_starts_on smallint NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
  enabled_modules text[] NOT NULL DEFAULT ARRAY['tasks','calendar','home','finance'],
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE roles (
  key text PRIMARY KEY,                     -- owner, admin, adult, teen, child, guest, caretaker, advisor
  label text NOT NULL,
  description text
);

CREATE TABLE permissions (
  key text PRIMARY KEY,                     -- contoh: finance.transaction.write
  description text
);

CREATE TABLE role_permissions (
  role_key text NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key text NOT NULL REFERENCES roles(key),
  nickname text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX wm_user_idx ON workspace_members(user_id) WHERE removed_at IS NULL;

CREATE TABLE member_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key),
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  expires_at timestamptz,
  UNIQUE (member_id, permission_key)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email citext,
  role_key text NOT NULL REFERENCES roles(key),
  token_hash bytea NOT NULL UNIQUE,         -- single-use, hashed
  invited_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Profil anggota keluarga (boleh tanpa akun: anak kecil, orang tua)
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  relation text,                            -- ayah, ibu, anak, kakek, ART, dst.
  birth_date date,
  color text,
  emergency_contact jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

-- ---------- 2. FILE & DOKUMEN ----------
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  original_name text,
  mime_type text,
  size_bytes bigint NOT NULL,
  sha256 bytea,
  encryption text NOT NULL DEFAULT 'server' CHECK (encryption IN ('server','client_e2ee')),
  wrapped_dek bytea,                        -- DEK dibungkus KEK (mode client_e2ee)
  av_status text NOT NULL DEFAULT 'pending' CHECK (av_status IN ('pending','clean','infected','skipped')),
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'lainnya',  -- identitas, properti, kendaraan, pajak, kesehatan, pendidikan, asuransi, ...
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  doc_number_enc bytea,                     -- nomor dokumen dienkripsi
  issued_on date,
  expires_on date,
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private','workspace','restricted')),
  owner_user_id uuid REFERENCES users(id),
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);
CREATE INDEX documents_expiry_idx ON documents(workspace_id, expires_on) WHERE deleted_at IS NULL;

CREATE TABLE document_files (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version_no int NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  PRIMARY KEY (document_id, file_id)
);

CREATE TABLE document_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  can_edit boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  UNIQUE (document_id, member_id)
);

-- ---------- 3. JADWAL & PENGULANGAN (dipakai semua modul) ----------
CREATE TABLE schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dtstart timestamptz NOT NULL,             -- instan awal (UTC)
  local_start timestamp,                    -- waktu dinding lokal (untuk DST-aman)
  tzid text NOT NULL DEFAULT 'Asia/Jakarta',
  all_day boolean NOT NULL DEFAULT false,
  duration_minutes int,
  rrule text,                               -- RFC 5545, tanpa DTSTART
  until_at timestamptz,
  count_limit int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  original_start timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('skip','override','done')),
  override_start timestamptz,
  override_payload jsonb,
  UNIQUE (schedule_id, original_start)
);

-- ---------- 4. TASK / PROYEK / KALENDER ----------
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  area text NOT NULL DEFAULT 'rumah' CHECK (area IN ('rumah','personal','keuangan','keluarga','kerja','lainnya')),
  color text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done','archived')),
  due_on date,
  owner_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  UNIQUE (workspace_id, name)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','blocked','done','cancelled')),
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  due_at timestamptz,
  due_all_day boolean NOT NULL DEFAULT false,
  start_at timestamptz,
  estimate_minutes int,
  schedule_id uuid REFERENCES schedules(id) ON DELETE SET NULL,   -- tugas berulang
  completion_mode text NOT NULL DEFAULT 'fixed' CHECK (completion_mode IN ('fixed','after_completion')),
  assignee_rotation text NOT NULL DEFAULT 'none' CHECK (assignee_rotation IN ('none','round_robin','least_done')),
  source_type text,                         -- 'asset_maintenance','bill','document_expiry','manual'
  source_id uuid,
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private','workspace')),
  created_by uuid REFERENCES users(id),
  completed_at timestamptz,
  sort_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);
CREATE INDEX tasks_ws_status_idx ON tasks(workspace_id, status, due_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_source_idx ON tasks(workspace_id, source_type, source_id);

CREATE TABLE task_assignees (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, member_id)
);

CREATE TABLE task_labels (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE TABLE checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0
);

CREATE TABLE task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  occurrence_start timestamptz,             -- instans mana dari tugas berulang
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  cost_minor bigint,                        -- opsional: biaya pekerjaan (servis, dst.)
  currency char(3)
);

CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  category text,
  color text,
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private','busy_only','workspace')),
  source_type text,                         -- 'bill','birthday','document_expiry','manual','google'
  source_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);
CREATE INDEX events_ws_idx ON calendar_events(workspace_id) WHERE deleted_at IS NULL;

CREATE TABLE event_attendees (
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  rsvp text NOT NULL DEFAULT 'pending' CHECK (rsvp IN ('pending','yes','no','maybe')),
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  member_id uuid REFERENCES workspace_members(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','skipped')),
  CHECK (ends_at > starts_at)
);

-- ---------- 5. REMINDER & NOTIFIKASI (mesin tunggal) ----------
CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('task','event','bill','document','maintenance','warranty','debt','goal','habit','custom')),
  owner_id uuid NOT NULL,
  offset_minutes int NOT NULL DEFAULT 0,    -- negatif = sebelum waktu acuan
  at_time_local time,                       -- untuk "jam 08:00 pada hari-H"
  member_id uuid REFERENCES workspace_members(id) ON DELETE CASCADE,
  channels text[] NOT NULL DEFAULT ARRAY['in_app','web_push'],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminders_owner_idx ON reminders(workspace_id, owner_type, owner_id);

CREATE TABLE reminder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  reminder_id uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  fire_at timestamptz NOT NULL,
  idempotency_key text NOT NULL UNIQUE,     -- reminder_id|occurrence|member
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled','suppressed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz
);
CREATE INDEX reminder_jobs_due_idx ON reminder_jobs(fire_at) WHERE status = 'pending';

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,                      -- generik; tanpa data sensitif
  body text,
  deep_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  quiet_start time,
  quiet_end time,
  daily_digest_at time,
  channels jsonb NOT NULL DEFAULT '{"in_app":true,"web_push":true,"email":false,"telegram":false,"ntfy":false}',
  hide_sensitive_preview boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, workspace_id)
);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz,
  expired_at timestamptz
);

-- ---------- 6. RUMAH: ASET, PERAWATAN, KENDARAAN, STOK ----------
CREATE TABLE assets (                        -- SATU registri aset (rumah, elektronik, kendaraan, perabot)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'barang' CHECK (kind IN ('properti','kendaraan','elektronik','perabot','alat','barang','lainnya')),
  name text NOT NULL,
  brand text,
  model text,
  serial_no_enc bytea,
  location text,                            -- ruangan/lokasi
  purchased_on date,
  purchase_price_minor bigint,
  currency char(3) NOT NULL DEFAULT 'IDR',
  warranty_until date,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','diperbaiki','dijual','rusak','dibuang')),
  owner_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  in_net_worth boolean NOT NULL DEFAULT false,
  current_value_minor bigint,
  parent_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);
CREATE INDEX assets_warranty_idx ON assets(workspace_id, warranty_until) WHERE deleted_at IS NULL;

CREATE TABLE asset_files (
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'foto' CHECK (role IN ('foto','nota','manual','garansi','lainnya')),
  PRIMARY KEY (asset_id, file_id)
);

CREATE TABLE vehicles (
  asset_id uuid PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plate_enc bytea,
  vehicle_type text,
  stnk_expires_on date,
  tax_due_on date,
  sim_holder_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  odometer_km int
);

CREATE TABLE maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  title text NOT NULL,
  schedule_id uuid REFERENCES schedules(id) ON DELETE SET NULL,
  interval_km int,
  interval_days int,
  default_assignee_member_id uuid REFERENCES workspace_members(id) ON DELETE SET NULL,
  est_cost_minor bigint,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES maintenance_plans(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  done_on date NOT NULL,
  odometer_km int,
  vendor text,
  cost_minor bigint,
  currency char(3) NOT NULL DEFAULT 'IDR',
  transaction_id uuid,                      -- FK ditambah setelah tabel transactions
  notes text,
  created_by uuid REFERENCES users(id)
);

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  location text,
  quantity numeric(12,3) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs',
  min_quantity numeric(12,3),
  expires_on date,
  barcode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  store text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit text,
  est_price_minor bigint,
  checked boolean NOT NULL DEFAULT false,
  added_by uuid REFERENCES users(id),
  checked_at timestamptz
);

CREATE TABLE contacts (                       -- kontak penting (tukang, dokter, darurat)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone_enc bytea,
  address text,
  notes text,
  is_emergency boolean NOT NULL DEFAULT false
);

-- ---------- 7. KEUANGAN ----------
CREATE TABLE fin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_member_id uuid REFERENCES workspace_members(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('kas','bank','ewallet','kartu_kredit','pinjaman','investasi','aset_lain','kewajiban_lain')),
  currency char(3) NOT NULL DEFAULT 'IDR',
  opening_balance_minor bigint NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private','workspace')),
  credit_limit_minor bigint,
  statement_day smallint CHECK (statement_day BETWEEN 1 AND 31),
  due_day smallint CHECK (due_day BETWEEN 1 AND 31),
  include_in_net_worth boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE fin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  icon text,
  archived_at timestamptz,
  UNIQUE (workspace_id, kind, name)
);

CREATE TABLE payees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_category_id uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
  UNIQUE (workspace_id, name)
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income','expense','transfer','debt_payment','investment_buy','investment_sell','adjustment')),
  account_id uuid NOT NULL REFERENCES fin_accounts(id),
  to_account_id uuid REFERENCES fin_accounts(id),         -- wajib untuk transfer
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  to_amount_minor bigint,                                  -- transfer lintas mata uang
  fx_rate numeric(20,10),
  occurred_at timestamptz NOT NULL,
  category_id uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
  payee_id uuid REFERENCES payees(id) ON DELETE SET NULL,
  member_id uuid REFERENCES workspace_members(id) ON DELETE SET NULL,
  description text,
  debt_id uuid,                                            -- FK setelah tabel debts
  bill_id uuid,                                            -- FK setelah tabel bills
  principal_minor bigint,                                  -- pembayaran utang: pokok
  interest_minor bigint,                                   -- pembayaran utang: bunga
  excluded_from_budget boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  reverses_id uuid REFERENCES transactions(id),            -- koreksi = transaksi pembalik
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id),
  client_mutation_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  CHECK (type <> 'transfer' OR (to_account_id IS NOT NULL AND to_account_id <> account_id)),
  CHECK (type = 'transfer' OR to_account_id IS NULL)
);
CREATE INDEX tx_ws_date_idx ON transactions(workspace_id, occurred_at DESC);
CREATE INDEX tx_account_idx ON transactions(account_id, occurred_at);
CREATE UNIQUE INDEX tx_mutation_uidx ON transactions(workspace_id, client_mutation_id) WHERE client_mutation_id IS NOT NULL;

CREATE TABLE transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  note text
);

CREATE TABLE transaction_files (
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, file_id)
);

CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_start date NOT NULL,               -- awal bulan
  method text NOT NULL DEFAULT 'envelope' CHECK (method IN ('envelope','category_limit','zero_based')),
  UNIQUE (workspace_id, period_start)
);

CREATE TABLE budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES fin_categories(id) ON DELETE CASCADE,
  planned_minor bigint NOT NULL DEFAULT 0,
  rollover boolean NOT NULL DEFAULT false,
  UNIQUE (budget_id, category_id)
);

CREATE TABLE bills (                         -- tagihan & langganan berulang
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  payee_id uuid REFERENCES payees(id) ON DELETE SET NULL,
  category_id uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES fin_accounts(id) ON DELETE SET NULL,
  amount_minor bigint,
  amount_is_estimate boolean NOT NULL DEFAULT true,
  currency char(3) NOT NULL DEFAULT 'IDR',
  schedule_id uuid REFERENCES schedules(id) ON DELETE SET NULL,
  is_subscription boolean NOT NULL DEFAULT false,
  autopay boolean NOT NULL DEFAULT false,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id uuid REFERENCES fin_accounts(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'owed_by_me' CHECK (direction IN ('owed_by_me','owed_to_me')),
  counterparty text NOT NULL,
  principal_minor bigint NOT NULL CHECK (principal_minor > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  annual_rate_bp int,                       -- basis poin
  term_months int,
  started_on date NOT NULL,
  next_due_on date,
  payoff_strategy text CHECK (payoff_strategy IN ('snowball','avalanche','manual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','written_off')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_minor bigint NOT NULL CHECK (target_minor > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  target_date date,
  account_id uuid REFERENCES fin_accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reached','paused','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  amount_minor bigint NOT NULL,
  contributed_on date NOT NULL
);

CREATE TABLE investment_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES fin_accounts(id) ON DELETE CASCADE,
  instrument text NOT NULL,                 -- ticker/nama reksa dana/emas
  asset_class text NOT NULL CHECK (asset_class IN ('saham','reksadana','obligasi','emas','kripto','deposito','properti','lainnya')),
  units numeric(24,8) NOT NULL DEFAULT 0,
  avg_cost_minor bigint,
  currency char(3) NOT NULL DEFAULT 'IDR',
  last_price_minor bigint,
  last_price_at timestamptz,
  price_source text NOT NULL DEFAULT 'manual'
);

CREATE TABLE fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base char(3) NOT NULL,
  quote char(3) NOT NULL,
  rate numeric(20,10) NOT NULL,
  as_of date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  UNIQUE (base, quote, as_of)
);

CREATE TABLE net_worth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  as_of date NOT NULL,
  assets_minor bigint NOT NULL,
  liabilities_minor bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'IDR',
  breakdown jsonb NOT NULL DEFAULT '{}',
  UNIQUE (workspace_id, as_of)
);

ALTER TABLE transactions ADD CONSTRAINT tx_debt_fk FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD CONSTRAINT tx_bill_fk FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE SET NULL;
ALTER TABLE maintenance_logs ADD CONSTRAINT ml_tx_fk FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;

-- ---------- 8. PERSONAL / BERDUA (opsional) ----------
CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  title_enc bytea,
  body_enc bytea NOT NULL,                  -- ciphertext AES-256-GCM dari klien
  nonce bytea NOT NULL,
  key_id text NOT NULL,                     -- referensi kunci user, bukan kuncinya
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared_partner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE mood_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_on date NOT NULL,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  note_enc bytea,
  share_with_partner boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, logged_on)
);

CREATE TABLE habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  schedule_id uuid REFERENCES schedules(id) ON DELETE SET NULL,
  target_per_period int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE habit_logs (
  habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  logged_on date NOT NULL,
  PRIMARY KEY (habit_id, logged_on)
);

CREATE TABLE special_dates (                  -- ulang tahun, anniversary, kapsul waktu
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  person_id uuid REFERENCES people(id) ON DELETE CASCADE,
  title text NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  year smallint,
  kind text NOT NULL DEFAULT 'ulang_tahun',
  unlock_at timestamptz,                    -- kapsul waktu
  message_enc bytea
);

-- ---------- 9. INTEGRASI & SINKRONISASI ----------
CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_calendar','telegram','ntfy','smtp','caldav')),
  account_label text,
  refresh_token_enc bytea,                  -- dienkripsi envelope (KMS/KEK server)
  scopes text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_reauth','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, provider, account_label)
);

CREATE TABLE external_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text,
  direction text NOT NULL DEFAULT 'two_way' CHECK (direction IN ('import','export','two_way')),
  sync_token text,
  last_synced_at timestamptz,
  channel_id text,                          -- Google push channel
  channel_expires_at timestamptz,
  UNIQUE (integration_id, external_id)
);

CREATE TABLE external_event_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  external_calendar_id uuid NOT NULL REFERENCES external_calendars(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  external_etag text,
  last_local_version int,
  last_synced_at timestamptz,
  UNIQUE (external_calendar_id, external_event_id),
  UNIQUE (external_calendar_id, event_id)
);

CREATE TABLE sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  local_payload jsonb NOT NULL,
  remote_payload jsonb NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text CHECK (resolution IN ('keep_local','keep_remote','merged'))
);

CREATE TABLE ics_feed_tokens (               -- langganan kalender read-only (.ics)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  scope text NOT NULL DEFAULT 'busy_only' CHECK (scope IN ('busy_only','titles')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE client_mutations (              -- idempotensi untuk antrean offline
  id uuid PRIMARY KEY,                      -- client_mutation_id
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  entity_type text NOT NULL,
  op text NOT NULL CHECK (op IN ('create','update','delete')),
  base_version int,
  result_status text NOT NULL CHECK (result_status IN ('applied','conflict','rejected')),
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 10. AUDIT & EVENT OUTBOX ----------
CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid,
  actor_user_id uuid,
  action text NOT NULL,                     -- login, document.download, transaction.void, ...
  entity_type text,
  entity_id uuid,
  ip inet,
  user_agent text,
  diff jsonb,                               -- tanpa nilai sensitif
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_ws_idx ON audit_logs(workspace_id, created_at DESC);

CREATE TABLE domain_events (                 -- transactional outbox
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL,
  event_type text NOT NULL,                 -- bill.due_soon, document.expiring, task.completed, ...
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX domain_events_pending_idx ON domain_events(id) WHERE processed_at IS NULL;

-- ---------- 11. TRIGGER VERSI & RLS OTOMATIS ----------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'version'
      AND c.table_name IN (SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='updated_at')
  LOOP
    EXECUTE format('CREATE TRIGGER trg_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;

  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'workspace_id' AND c.table_name <> 'workspaces'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id())', t);
  END LOOP;
END $$;

-- Data awal peran (izin granular diisi lewat seed terpisah)
INSERT INTO roles(key,label,description) VALUES
 ('owner','Pemilik','Kontrol penuh, kelola anggota & penghapusan workspace'),
 ('admin','Admin','Kelola modul & anggota, tanpa hapus workspace'),
 ('adult','Dewasa','Akses penuh data bersama, data privat milik sendiri'),
 ('teen','Remaja','Tugas, kalender, uang saku; keuangan keluarga hanya baca terbatas'),
 ('child','Anak','Tugas & kalender sendiri, tanpa keuangan/dokumen'),
 ('caretaker','Pengasuh/ART','Tugas rumah & daftar belanja saja'),
 ('advisor','Penasihat','Baca-saja terbatas dan berkedaluwarsa (akuntan, notaris)'),
 ('guest','Tamu','Baca-saja satu item/tautan bersama');
