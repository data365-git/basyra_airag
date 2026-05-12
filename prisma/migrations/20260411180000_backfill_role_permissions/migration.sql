-- Backfill missing settings.categories and settings.translations keys in roles
-- that were created before these permission groups were added.
-- jsonb_set with create_if_missing=true only sets the key if it doesn't already exist.

UPDATE "roles"
SET "permissions" = jsonb_set(
  jsonb_set(
    "permissions",
    '{settings,categories}',
    '{"view": false, "create": false, "edit": false, "delete": false}'::jsonb,
    true
  ),
  '{settings,translations}',
  '{"view": false, "edit": false}'::jsonb,
  true
)
WHERE
  NOT ("permissions" -> 'settings' ? 'categories')
  OR NOT ("permissions" -> 'settings' ? 'translations');
