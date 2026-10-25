CREATE TABLE courts (id UUID PRIMARY KEY,name VARCHAR(80) NOT NULL,type VARCHAR(30) NOT NULL,hourly_price_cents INTEGER NOT NULL CHECK(hourly_price_cents>0),enabled BOOLEAN NOT NULL);
CREATE TABLE bookings (
 id UUID PRIMARY KEY,court_id UUID NOT NULL REFERENCES courts(id),member_id UUID NOT NULL,member_name VARCHAR(120) NOT NULL,
 starts_at TIMESTAMP WITH TIME ZONE NOT NULL,ends_at TIMESTAMP WITH TIME ZONE NOT NULL,players INTEGER NOT NULL CHECK(players BETWEEN 2 AND 4),
 status VARCHAR(20) NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>=0),CONSTRAINT valid_booking_dates CHECK(ends_at>starts_at)
);
CREATE INDEX idx_booking_court_time ON bookings(court_id,starts_at,ends_at);
CREATE INDEX idx_booking_member_time ON bookings(member_id,starts_at);
INSERT INTO courts VALUES ('11111111-1111-1111-1111-111111111111','Court 01 · Panorama','OUTDOOR',2400,TRUE);
INSERT INTO courts VALUES ('22222222-2222-2222-2222-222222222222','Court 02 · Olive','OUTDOOR',2400,TRUE);
INSERT INTO courts VALUES ('33333333-3333-3333-3333-333333333333','Court 03 · Arena','INDOOR',3000,TRUE);
