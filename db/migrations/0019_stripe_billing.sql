-- 0019: Stripe billing linkage for Teacher Pro self-serve upgrades.
--
-- checkout.session.completed sets plan='pro' and records the Stripe ids;
-- customer.subscription.deleted finds the profile by subscription id and
-- reverts plan to 'free'. Additive and safe on live data.

alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists idx_profiles_stripe_subscription
  on profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;
