CREATE TABLE IF NOT EXISTS aircraft_flight_history (
    registration VARCHAR(20) PRIMARY KEY,

    flight_number VARCHAR(20) NOT NULL,
    origin VARCHAR(4) NOT NULL,
    destination VARCHAR(4) NOT NULL,

    off_blocks_ms BIGINT NOT NULL,
    on_blocks_ms BIGINT NOT NULL,

    pax INTEGER NOT NULL DEFAULT 0,

    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_history_updated_at
    ON aircraft_flight_history (updated_at);
