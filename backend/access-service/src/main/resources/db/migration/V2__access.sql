CREATE TABLE access_audits (id UUID PRIMARY KEY,booking_id UUID NOT NULL,member_id UUID NOT NULL,checked_by VARCHAR(100) NOT NULL,allowed BOOLEAN NOT NULL,reason VARCHAR(40) NOT NULL,checked_at TIMESTAMP WITH TIME ZONE NOT NULL);
CREATE INDEX idx_access_time ON access_audits(checked_at);
