CREATE TABLE IF NOT EXISTS techlog_defects (
    id BIGSERIAL PRIMARY KEY,

    registration VARCHAR(20) NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'DEFERRED', 'CLOSED')),

    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    closed_at TIMESTAMPTZ,
    closed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_techlog_registration
    ON techlog_defects (registration);

CREATE INDEX IF NOT EXISTS idx_techlog_registration_status
    ON techlog_defects (registration, status);

CREATE INDEX IF NOT EXISTS idx_techlog_closed_at
    ON techlog_defects (closed_at);
