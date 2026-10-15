-- PostgreSQL / Supabase equivalent of mysql_schema.sql. Run in the SQL editor, then load the starter campus
-- by opening the waypoint editor, importing a campus JSON and pressing "Save to database".
-- Set DB_DRIVER=pgsql, DB_PORT=5432, DB_NAME=postgres in the environment.
CREATE TABLE IF NOT EXISTS campuses (
    id         BIGSERIAL PRIMARY KEY,
    slug       VARCHAR(64)  NOT NULL UNIQUE,
    name       VARCHAR(160) NOT NULL,
    data       JSONB        NOT NULL,
    version    INTEGER      NOT NULL DEFAULT 1,
    is_active  SMALLINT     NOT NULL DEFAULT 1,      -- SMALLINT (not boolean) so "is_active = 1" works like on MySQL
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION campuses_touch() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS campuses_touch ON campuses;
CREATE TRIGGER campuses_touch BEFORE UPDATE ON campuses FOR EACH ROW EXECUTE FUNCTION campuses_touch();

CREATE TABLE IF NOT EXISTS campus_versions (
    id         BIGSERIAL PRIMARY KEY,
    campus_id  BIGINT       NOT NULL REFERENCES campuses (id) ON DELETE CASCADE,
    version    INTEGER      NOT NULL,
    data       JSONB        NOT NULL,
    note       VARCHAR(255),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (campus_id, version)
);
