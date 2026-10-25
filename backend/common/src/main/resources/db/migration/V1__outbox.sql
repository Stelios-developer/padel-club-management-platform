CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    routing_key VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_outbox_created ON outbox_events(created_at);
