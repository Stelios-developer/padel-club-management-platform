ALTER TABLE bookings ADD COLUMN open_match BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN match_level VARCHAR(20) NOT NULL DEFAULT 'ANY';
ALTER TABLE bookings ADD COLUMN series_id UUID;
CREATE TABLE booking_players (
 id UUID PRIMARY KEY,booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 member_id UUID NOT NULL,player_name VARCHAR(120) NOT NULL,
 starts_at TIMESTAMP WITH TIME ZONE NOT NULL,ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED')),
 CONSTRAINT one_player_per_booking UNIQUE(booking_id,member_id),CHECK(ends_at>starts_at)
);
CREATE INDEX idx_player_schedule ON booking_players(member_id,status,starts_at,ends_at);
-- Existing owners are real participants too; historical cancellations stay inactive.
INSERT INTO booking_players(id,booking_id,member_id,player_name,starts_at,ends_at,status)
 SELECT id,id,member_id,member_name,starts_at,ends_at,
 CASE WHEN status='CONFIRMED' THEN 'ACCEPTED' ELSE 'CANCELLED' END FROM bookings;
CREATE TABLE slot_waitlist (
 id UUID PRIMARY KEY,member_id UUID NOT NULL,court_id UUID NOT NULL REFERENCES courts(id),
 starts_at TIMESTAMP WITH TIME ZONE NOT NULL,ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('WAITING','NOTIFIED','CANCELLED')),
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 CONSTRAINT one_wait_per_slot UNIQUE(member_id,court_id,starts_at,ends_at),CHECK(ends_at>starts_at)
);
CREATE INDEX idx_waitlist_court ON slot_waitlist(court_id,status,starts_at);
