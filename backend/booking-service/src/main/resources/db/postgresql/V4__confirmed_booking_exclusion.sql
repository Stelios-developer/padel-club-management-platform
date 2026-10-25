-- PostgreSQL-only: H2 business-rule tests do not implement exclusion constraints.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Do not silently cancel or delete existing reservations during an upgrade.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM bookings a JOIN bookings b
          ON a.id < b.id AND a.court_id = b.court_id
         AND a.starts_at < b.ends_at AND a.ends_at > b.starts_at
        WHERE a.status = 'CONFIRMED' AND b.status = 'CONFIRMED'
    ) THEN
        RAISE EXCEPTION 'Cannot protect bookings: existing confirmed reservations overlap.'
            USING HINT = 'Resolve conflicting reservations explicitly, then retry the migration.';
    END IF;
END $$;

ALTER TABLE bookings
    ADD CONSTRAINT bookings_no_confirmed_overlap
    EXCLUDE USING gist (
        court_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    ) WHERE (status = 'CONFIRMED');
