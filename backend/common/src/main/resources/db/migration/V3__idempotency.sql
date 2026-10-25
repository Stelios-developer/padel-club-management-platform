CREATE TABLE idempotency_requests (
    subject VARCHAR(255) NOT NULL,
    operation VARCHAR(80) NOT NULL,
    request_key UUID NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    response TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (subject, operation, request_key)
);
