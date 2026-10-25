CREATE TABLE booking_changes (
 id UUID PRIMARY KEY, booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 action VARCHAR(40) NOT NULL, actor_subject VARCHAR(100) NOT NULL, actor_name VARCHAR(160) NOT NULL,
 reason VARCHAR(240) NOT NULL, before_data TEXT, after_data TEXT NOT NULL, changed_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX booking_changes_history ON booking_changes(booking_id,changed_at DESC);
CREATE TABLE booking_attendance (
 id UUID PRIMARY KEY, booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 member_id UUID NOT NULL, player_name VARCHAR(120) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PRESENT','ABSENT')),
 recorded_by VARCHAR(100) NOT NULL, recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
 CONSTRAINT attendance_per_player UNIQUE(booking_id,member_id)
);
