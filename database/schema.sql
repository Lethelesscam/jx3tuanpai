CREATE TABLE IF NOT EXISTS people (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  session_hash VARCHAR(128) NOT NULL,
  created_at BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY people_session_hash_unique (session_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS entries (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_key VARCHAR(768) NOT NULL,
  kind VARCHAR(5) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY entries_name_key_unique (name_key),
  KEY entries_created_idx (created_at DESC, id DESC),
  FOREIGN KEY (author_id) REFERENCES people (id),
  CONSTRAINT entry_kind CHECK (kind IN ('red', 'black'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS reviews (
  entry_id VARCHAR(64) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  note TEXT NOT NULL DEFAULT (''),
  rating TINYINT,
  vote TINYINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (entry_id, author_id),
  KEY reviews_author (author_id),
  KEY reviews_updated_idx (updated_at DESC),
  FOREIGN KEY (entry_id) REFERENCES entries (id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES people (id),
  CONSTRAINT review_rating CHECK (rating BETWEEN 1 AND 10),
  CONSTRAINT review_vote CHECK (vote IN (-1, 0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS board_write_lock (
  id TINYINT PRIMARY KEY
) ENGINE=InnoDB;

INSERT INTO board_write_lock (id) VALUES (1) ON DUPLICATE KEY UPDATE id = 1;
