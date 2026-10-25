CREATE TABLE notifications (
 id UUID PRIMARY KEY,member_id UUID NOT NULL,email VARCHAR(254) NOT NULL,title VARCHAR(160) NOT NULL,detail TEXT NOT NULL,
 status VARCHAR(20) NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMP WITH TIME ZONE NOT NULL,next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,sent_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_notifications_pending ON notifications(status,next_attempt_at);
