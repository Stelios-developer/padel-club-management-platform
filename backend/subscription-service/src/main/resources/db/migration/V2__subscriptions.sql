CREATE TABLE subscriptions (
 id UUID PRIMARY KEY, member_id UUID NOT NULL, plan VARCHAR(30) NOT NULL,
 starts_on DATE NOT NULL, ends_on DATE NOT NULL, paid_cents INTEGER NOT NULL CHECK (paid_cents >= 0), status VARCHAR(20) NOT NULL,
 CONSTRAINT valid_subscription_dates CHECK (ends_on >= starts_on)
);
CREATE INDEX idx_subscription_member_dates ON subscriptions(member_id,starts_on,ends_on);
