-- =============================================================================
-- NovaMart — 0022 Reviews, ratings and Q&A (brief §51)
--
-- Only a delivered order item earns the "Verified Purchase" badge, and the badge is
-- computed from order data rather than trusted from the client. One review per
-- (product, user) prevents review stuffing.
-- =============================================================================

create table commerce.reviews (
  id                  uuid primary key default private.uuid_generate_v7(),
  product_id          uuid        not null references catalog.products (id) on delete cascade,
  user_id             uuid        not null references identity.profiles (id) on delete cascade,
  -- The purchase this review is about. Required for a verified badge.
  order_item_id       uuid        references commerce.order_items (id) on delete set null,
  -- Which seller fulfilled it: seller ratings are derived from these.
  seller_id           uuid        references seller.sellers (id) on delete set null,
  variant_id          uuid        references catalog.product_variants (id) on delete set null,

  rating              smallint    not null check (rating between 1 and 5),
  title               text        check (title is null or length(trim(title)) between 3 and 120),
  body                text        check (body is null or length(trim(body)) between 5 and 5000),
  -- Optional structured sub-ratings, configured per category.
  aspect_ratings      jsonb       not null default '{}'::jsonb,
  -- Separate seller rating, so a good product from a bad seller is expressible.
  seller_rating       smallint    check (seller_rating is null or seller_rating between 1 and 5),

  is_verified_purchase boolean    not null default false,
  -- Locale of the review text, for language-aware display.
  locale              public.locale_code,

  status              text        not null default 'PENDING_MODERATION'
                        check (status in ('PENDING_MODERATION', 'PUBLISHED', 'REJECTED',
                                          'HIDDEN', 'FLAGGED', 'DELETED')),
  moderation_reason   text,
  moderated_by        uuid        references identity.profiles (id) on delete set null,
  moderated_at        timestamptz,
  -- Automated moderation signal before a human looks.
  auto_moderation_score numeric(5, 2),
  auto_moderation_labels text[]   not null default '{}',

  helpful_count       integer     not null default 0 check (helpful_count >= 0),
  not_helpful_count   integer     not null default 0 check (not_helpful_count >= 0),
  report_count        integer     not null default 0 check (report_count >= 0),

  -- Seller's public response.
  seller_response     text,
  seller_responded_at timestamptz,
  seller_responded_by uuid        references identity.profiles (id) on delete set null,

  -- Signals used by the fake-review rules.
  submitted_from_ip   inet,
  device_id           text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  edited_at           timestamptz,

  -- One review per product per customer.
  unique (product_id, user_id),
  constraint reviews_moderation_reason
    check (status not in ('REJECTED', 'HIDDEN') or moderation_reason is not null),
  constraint reviews_content_present check (rating is not null and (title is not null or body is not null or rating is not null))
);

comment on table commerce.reviews is
  'Product reviews. is_verified_purchase is derived from a DELIVERED order item, never accepted from the client.';

create index reviews_product_idx   on commerce.reviews (product_id, created_at desc)
  where status = 'PUBLISHED';
create index reviews_product_rating_idx on commerce.reviews (product_id, rating)
  where status = 'PUBLISHED';
create index reviews_product_helpful_idx on commerce.reviews (product_id, helpful_count desc)
  where status = 'PUBLISHED';
create index reviews_user_idx      on commerce.reviews (user_id, created_at desc);
create index reviews_seller_idx    on commerce.reviews (seller_id, created_at desc) where seller_id is not null;
create index reviews_moderation_queue_idx on commerce.reviews (created_at)
  where status in ('PENDING_MODERATION', 'FLAGGED');
create index reviews_reported_idx  on commerce.reviews (report_count desc) where report_count > 0;
-- Fake-review detection: many reviews from one device or IP.
create index reviews_device_idx    on commerce.reviews (device_id, created_at desc) where device_id is not null;

create trigger reviews_set_updated_at
  before update on commerce.reviews
  for each row execute function private.set_updated_at();

-- Derive the verified badge and the seller attribution from order data. A client
-- claiming "verified" is ignored.
create or replace function commerce.derive_review_verification()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_item commerce.order_items;
begin
  new.is_verified_purchase := false;

  if new.order_item_id is not null then
    select * into v_item from commerce.order_items where id = new.order_item_id;

    if v_item.id is not null then
      -- The item must belong to this reviewer, be for this product, and be delivered.
      if v_item.product_id = new.product_id
         and v_item.status = 'DELIVERED'
         and exists (select 1 from commerce.orders o
                      where o.id = v_item.order_id and o.user_id = new.user_id) then
        new.is_verified_purchase := true;
        new.seller_id := coalesce(new.seller_id, v_item.seller_id);
      else
        -- A mismatched reference is a client bug or an abuse attempt; drop it.
        new.order_item_id := null;
      end if;
    else
      new.order_item_id := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger reviews_derive_verification
  before insert or update of order_item_id, product_id on commerce.reviews
  for each row execute function commerce.derive_review_verification();

create table commerce.review_media (
  id             uuid primary key default extensions.gen_random_uuid(),
  review_id      uuid        not null references commerce.reviews (id) on delete cascade,
  media_type     text        not null check (media_type in ('IMAGE', 'VIDEO')),
  storage_bucket text        not null default 'reviews-public'
                   check (storage_bucket = 'reviews-public'),
  storage_path   text        not null,
  public_url     text        not null,
  mime_type      text        not null,
  file_size_bytes integer    not null check (file_size_bytes between 1 and 26214400),
  width_px       integer,
  height_px      integer,
  duration_seconds integer,
  moderation_status text     not null default 'PENDING'
                   check (moderation_status in ('PENDING', 'APPROVED', 'REJECTED')),
  display_order  smallint    not null default 100,
  created_at     timestamptz not null default now()
);

create index review_media_review_idx on commerce.review_media (review_id, display_order);
create index review_media_moderation_idx on commerce.review_media (created_at)
  where moderation_status = 'PENDING';

create table commerce.review_votes (
  review_id  uuid        not null references commerce.reviews (id) on delete cascade,
  user_id    uuid        not null references identity.profiles (id) on delete cascade,
  is_helpful boolean     not null,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create index review_votes_user_idx on commerce.review_votes (user_id);

-- Vote counters are maintained by trigger so the read path never aggregates.
create or replace function commerce.refresh_review_votes()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_review_id uuid := coalesce(new.review_id, old.review_id);
begin
  update commerce.reviews r
     set helpful_count     = (select count(*) from commerce.review_votes v
                               where v.review_id = v_review_id and v.is_helpful),
         not_helpful_count = (select count(*) from commerce.review_votes v
                               where v.review_id = v_review_id and not v.is_helpful)
   where r.id = v_review_id;
  return null;
end;
$$;

create trigger review_votes_refresh
  after insert or update or delete on commerce.review_votes
  for each row execute function commerce.refresh_review_votes();

create table commerce.review_reports (
  id           uuid primary key default extensions.gen_random_uuid(),
  review_id    uuid        not null references commerce.reviews (id) on delete cascade,
  reported_by  uuid        references identity.profiles (id) on delete set null,
  reason       text        not null
                 check (reason in ('SPAM', 'OFFENSIVE', 'IRRELEVANT', 'FAKE', 'PERSONAL_INFO',
                                    'PROMOTIONAL', 'WRONG_PRODUCT', 'OTHER')),
  details      text,
  status       text        not null default 'PENDING'
                 check (status in ('PENDING', 'UPHELD', 'DISMISSED')),
  reviewed_by  uuid        references identity.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (review_id, reported_by)
);

create index review_reports_queue_idx on commerce.review_reports (created_at) where status = 'PENDING';

create or replace function commerce.refresh_review_report_count()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_review_id uuid := coalesce(new.review_id, old.review_id);
  v_count     integer;
begin
  select count(*) into v_count from commerce.review_reports
   where review_id = v_review_id and status = 'PENDING';

  update commerce.reviews r
     set report_count = v_count,
         -- Enough credible reports pull the review for human review automatically.
         status = case when v_count >= 3 and r.status = 'PUBLISHED' then 'FLAGGED' else r.status end
   where r.id = v_review_id;

  return null;
end;
$$;

create trigger review_reports_refresh
  after insert or delete or update of status on commerce.review_reports
  for each row execute function commerce.refresh_review_report_count();

-- -----------------------------------------------------------------------------
-- commerce.product_rating_summary — the PDP read model. Maintained by trigger so
-- the product page never aggregates over reviews.
-- -----------------------------------------------------------------------------
create table commerce.product_rating_summary (
  product_id        uuid primary key references catalog.products (id) on delete cascade,
  average_rating    numeric(3, 2) not null default 0 check (average_rating between 0 and 5),
  rating_count      integer     not null default 0 check (rating_count >= 0),
  review_count      integer     not null default 0 check (review_count >= 0),
  verified_review_count integer not null default 0 check (verified_review_count >= 0),
  -- Star distribution for the histogram.
  count_1_star      integer     not null default 0,
  count_2_star      integer     not null default 0,
  count_3_star      integer     not null default 0,
  count_4_star      integer     not null default 0,
  count_5_star      integer     not null default 0,
  -- Weighted score used for ranking, so a 5.0 from two reviews does not outrank a
  -- 4.6 from ten thousand (Bayesian average against the platform mean).
  ranking_score     numeric(6, 4) not null default 0,
  media_count       integer     not null default 0,
  updated_at        timestamptz not null default now()
);

create index product_rating_summary_rating_idx on commerce.product_rating_summary (average_rating desc, rating_count desc);
create index product_rating_summary_ranking_idx on commerce.product_rating_summary (ranking_score desc);

create or replace function commerce.refresh_product_rating_summary()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_product_id uuid := coalesce(new.product_id, old.product_id);
  -- Bayesian prior: platform mean rating and a confidence weight.
  c_prior_mean  numeric := 4.0;
  c_prior_count numeric := 20;
  v_avg numeric;
  v_cnt integer;
begin
  insert into commerce.product_rating_summary (product_id) values (v_product_id)
  on conflict (product_id) do nothing;

  select coalesce(avg(rating), 0), count(*)
    into v_avg, v_cnt
    from commerce.reviews
   where product_id = v_product_id and status = 'PUBLISHED';

  update commerce.product_rating_summary s
     set average_rating = round(v_avg, 2),
         rating_count   = v_cnt,
         review_count   = (select count(*) from commerce.reviews
                            where product_id = v_product_id and status = 'PUBLISHED'
                              and (body is not null or title is not null)),
         verified_review_count = (select count(*) from commerce.reviews
                                   where product_id = v_product_id and status = 'PUBLISHED'
                                     and is_verified_purchase),
         count_1_star = (select count(*) from commerce.reviews where product_id = v_product_id and status = 'PUBLISHED' and rating = 1),
         count_2_star = (select count(*) from commerce.reviews where product_id = v_product_id and status = 'PUBLISHED' and rating = 2),
         count_3_star = (select count(*) from commerce.reviews where product_id = v_product_id and status = 'PUBLISHED' and rating = 3),
         count_4_star = (select count(*) from commerce.reviews where product_id = v_product_id and status = 'PUBLISHED' and rating = 4),
         count_5_star = (select count(*) from commerce.reviews where product_id = v_product_id and status = 'PUBLISHED' and rating = 5),
         ranking_score = round(
           ((c_prior_count * c_prior_mean) + (v_cnt * v_avg)) / (c_prior_count + v_cnt), 4
         ),
         updated_at = now()
   where s.product_id = v_product_id;

  return null;
end;
$$;

create trigger reviews_refresh_summary
  after insert or delete or update of status, rating on commerce.reviews
  for each row execute function commerce.refresh_product_rating_summary();

-- -----------------------------------------------------------------------------
-- Q&A
-- -----------------------------------------------------------------------------
create table commerce.product_questions (
  id             uuid primary key default private.uuid_generate_v7(),
  product_id     uuid        not null references catalog.products (id) on delete cascade,
  user_id        uuid        references identity.profiles (id) on delete set null,
  body           text        not null check (length(trim(body)) between 5 and 500),
  status         text        not null default 'PENDING_MODERATION'
                   check (status in ('PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'HIDDEN')),
  moderation_reason text,
  answer_count   integer     not null default 0 check (answer_count >= 0),
  upvote_count   integer     not null default 0,
  -- Most-asked questions surface first on the PDP.
  is_featured    boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index product_questions_product_idx on commerce.product_questions (product_id, upvote_count desc)
  where status = 'PUBLISHED';
create index product_questions_queue_idx on commerce.product_questions (created_at)
  where status = 'PENDING_MODERATION';
create index product_questions_user_idx on commerce.product_questions (user_id) where user_id is not null;

create trigger product_questions_set_updated_at
  before update on commerce.product_questions
  for each row execute function private.set_updated_at();

create table commerce.product_answers (
  id             uuid primary key default private.uuid_generate_v7(),
  question_id    uuid        not null references commerce.product_questions (id) on delete cascade,
  user_id        uuid        references identity.profiles (id) on delete set null,
  seller_id      uuid        references seller.sellers (id) on delete set null,
  -- Answers from the seller or a verified buyer carry more weight on the PDP.
  answerer_type  text        not null default 'CUSTOMER'
                   check (answerer_type in ('CUSTOMER', 'SELLER', 'BRAND', 'NOVAMART')),
  is_verified_buyer boolean  not null default false,
  body           text        not null check (length(trim(body)) between 2 and 2000),
  status         text        not null default 'PENDING_MODERATION'
                   check (status in ('PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'HIDDEN')),
  moderation_reason text,
  upvote_count   integer     not null default 0,
  downvote_count integer     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index product_answers_question_idx on commerce.product_answers (question_id, upvote_count desc)
  where status = 'PUBLISHED';
create index product_answers_queue_idx on commerce.product_answers (created_at)
  where status = 'PENDING_MODERATION';

create trigger product_answers_set_updated_at
  before update on commerce.product_answers
  for each row execute function private.set_updated_at();

create or replace function commerce.refresh_question_answer_count()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_question_id uuid := coalesce(new.question_id, old.question_id);
begin
  update commerce.product_questions q
     set answer_count = (select count(*) from commerce.product_answers a
                          where a.question_id = v_question_id and a.status = 'PUBLISHED')
   where q.id = v_question_id;
  return null;
end;
$$;

create trigger product_answers_refresh_count
  after insert or delete or update of status on commerce.product_answers
  for each row execute function commerce.refresh_question_answer_count();

create table commerce.question_votes (
  id           uuid primary key default extensions.gen_random_uuid(),
  user_id      uuid        not null references identity.profiles (id) on delete cascade,
  question_id  uuid        references commerce.product_questions (id) on delete cascade,
  answer_id    uuid        references commerce.product_answers (id) on delete cascade,
  is_upvote    boolean     not null,
  created_at   timestamptz not null default now(),
  constraint question_votes_single_target check (
    (question_id is not null)::int + (answer_id is not null)::int = 1
  )
);

create unique index question_votes_question_unique_idx on commerce.question_votes (question_id, user_id)
  where question_id is not null;
create unique index question_votes_answer_unique_idx on commerce.question_votes (answer_id, user_id)
  where answer_id is not null;

create or replace function commerce.refresh_qa_votes()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_question_id uuid := coalesce(new.question_id, old.question_id);
  v_answer_id   uuid := coalesce(new.answer_id, old.answer_id);
begin
  if v_question_id is not null then
    update commerce.product_questions q
       set upvote_count = (select count(*) from commerce.question_votes v
                            where v.question_id = v_question_id and v.is_upvote)
     where q.id = v_question_id;
  end if;

  if v_answer_id is not null then
    update commerce.product_answers a
       set upvote_count   = (select count(*) from commerce.question_votes v
                              where v.answer_id = v_answer_id and v.is_upvote),
           downvote_count = (select count(*) from commerce.question_votes v
                              where v.answer_id = v_answer_id and not v.is_upvote)
     where a.id = v_answer_id;
  end if;

  return null;
end;
$$;

create trigger question_votes_refresh
  after insert or update or delete on commerce.question_votes
  for each row execute function commerce.refresh_qa_votes();

-- -----------------------------------------------------------------------------
-- Seller rating rollup, derived from review seller_rating values.
-- -----------------------------------------------------------------------------
create or replace function commerce.refresh_seller_rating()
returns trigger
language plpgsql
set search_path = commerce, seller, pg_catalog
as $$
declare
  v_seller_id uuid := coalesce(new.seller_id, old.seller_id);
begin
  if v_seller_id is null then
    return null;
  end if;

  update seller.sellers s
     set rating = sub.avg_rating,
         rating_count = sub.cnt
    from (
      select round(avg(r.seller_rating), 2) as avg_rating, count(*) as cnt
        from commerce.reviews r
       where r.seller_id = v_seller_id
         and r.status = 'PUBLISHED'
         and r.seller_rating is not null
    ) sub
   where s.id = v_seller_id;

  return null;
end;
$$;

create trigger reviews_refresh_seller_rating
  after insert or delete or update of seller_rating, status on commerce.reviews
  for each row execute function commerce.refresh_seller_rating();
