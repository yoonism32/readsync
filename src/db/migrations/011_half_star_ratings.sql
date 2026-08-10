-- rating was INTEGER CHECK (rating >= 1 AND rating <= 5) (see
-- 001_initial_schema.sql) with no user-facing write path — the only writer
-- was the backup-restore import. Shipping the half-star rating UI needs 0.5
-- increments, which the INTEGER column rejects outright:
-- `invalid input syntax for type integer: "4.5"`.
--
-- NUMERIC(2,1) stores one decimal place exactly (no float drift). NULL
-- stays "unrated" — already the convention read paths COALESCE to 0 for.
-- The CHECK constrains the range to the half-star grid: 0.5-5.0 in 0.5
-- steps. rating*2 = round(rating*2) rejects anything off-grid (e.g. 2.3).

ALTER TABLE user_novel_meta DROP CONSTRAINT IF EXISTS user_novel_meta_rating_check;
ALTER TABLE user_novel_meta ALTER COLUMN rating TYPE NUMERIC(2,1) USING rating::NUMERIC(2,1);
ALTER TABLE user_novel_meta ADD CONSTRAINT user_novel_meta_rating_check
  CHECK ("rating" IS NULL OR ("rating" >= 0.5 AND "rating" <= 5 AND "rating" * 2 = ROUND("rating" * 2)));
