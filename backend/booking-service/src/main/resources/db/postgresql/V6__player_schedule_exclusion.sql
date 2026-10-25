-- V4 installed btree_gist. Preflight leaves existing data unchanged on conflict.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM booking_players a JOIN booking_players b
  ON a.id<b.id AND a.member_id=b.member_id
  AND a.status='ACCEPTED' AND b.status='ACCEPTED'
  AND a.starts_at<b.ends_at AND b.starts_at<a.ends_at) THEN
  RAISE EXCEPTION 'Accepted players have overlapping games; resolve them before applying V6.';
 END IF;
END $$;
ALTER TABLE booking_players ADD CONSTRAINT players_no_confirmed_overlap
 EXCLUDE USING gist(member_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
 WHERE(status='ACCEPTED');

-- Keep owner participation valid even for SQL writers that bypass the application.
CREATE FUNCTION sync_booking_players() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.member_id<>NEW.member_id THEN
  RAISE EXCEPTION 'Changing a booking owner is not supported.' USING ERRCODE='23514';
 END IF;
 UPDATE booking_players SET starts_at=NEW.starts_at,ends_at=NEW.ends_at,
  status=CASE WHEN NEW.status='CANCELLED' THEN 'CANCELLED' ELSE status END
  WHERE booking_id=NEW.id;
 INSERT INTO booking_players(id,booking_id,member_id,player_name,starts_at,ends_at,status)
 VALUES(gen_random_uuid(),NEW.id,NEW.member_id,NEW.member_name,NEW.starts_at,NEW.ends_at,
  CASE WHEN NEW.status='CONFIRMED' THEN 'ACCEPTED' ELSE 'CANCELLED' END)
 ON CONFLICT(booking_id,member_id) DO UPDATE SET
  player_name=EXCLUDED.player_name,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,status=EXCLUDED.status;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_owner_schedule AFTER INSERT OR UPDATE ON bookings
 FOR EACH ROW EXECUTE FUNCTION sync_booking_players();
