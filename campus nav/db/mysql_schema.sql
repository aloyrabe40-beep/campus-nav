-- XAMPP (MariaDB / MySQL). Open http://localhost/phpmyadmin -> SQL tab -> paste -> Go.
-- Safe to run more than once. Creates the database `campus_ar`.
CREATE DATABASE IF NOT EXISTS campus_ar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campus_ar;

-- One row per campus. `data` is the campus JSON document (floors, waypoints, rooms, QR list, stairs).
CREATE TABLE IF NOT EXISTS campuses (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug       VARCHAR(64)  NOT NULL,
    name       VARCHAR(160) NOT NULL,
    data       LONGTEXT     NOT NULL,
    version    INT          NOT NULL DEFAULT 1,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_campus_slug (slug),
    CONSTRAINT chk_campus_json CHECK (JSON_VALID(data))
) ENGINE=InnoDB;

-- Every save from the editor keeps a copy, so you can roll back.
CREATE TABLE IF NOT EXISTS campus_versions (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    campus_id  BIGINT UNSIGNED NOT NULL,
    version    INT          NOT NULL,
    data       LONGTEXT     NOT NULL,
    note       VARCHAR(255) NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_campus_version (campus_id, version),
    CONSTRAINT fk_version_campus FOREIGN KEY (campus_id) REFERENCES campuses (id) ON DELETE CASCADE,
    CONSTRAINT chk_version_json CHECK (JSON_VALID(data))
) ENGINE=InnoDB;
