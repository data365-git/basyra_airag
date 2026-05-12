-- Backfill chatbot permissions for roles created before the chatbot admin area.
-- Production may already have roles whose JSON does not contain the "chatbot"
-- bucket, which makes the sidebar hide /chatbot even though the routes exist.

UPDATE "roles"
SET "permissions" = jsonb_set(
  "permissions",
  '{chatbot}',
  CASE
    WHEN "is_superadmin" = true OR lower("name") IN ('admin', 'superadmin', 'super admin')
      THEN '{"view": true, "conversations": true, "content": true, "broadcast": true, "settings": true}'::jsonb
    ELSE '{"view": false, "conversations": false, "content": false, "broadcast": false, "settings": false}'::jsonb
  END,
  true
)
WHERE NOT ("permissions" ? 'chatbot');

-- If an existing superadmin/Admin role already has a partial chatbot bucket,
-- make sure it receives the complete replicated admin space.
UPDATE "roles"
SET "permissions" = jsonb_set(
  "permissions",
  '{chatbot}',
  (
    COALESCE("permissions" -> 'chatbot', '{}'::jsonb)
    || '{"view": true, "conversations": true, "content": true, "broadcast": true, "settings": true}'::jsonb
  ),
  true
)
WHERE "is_superadmin" = true OR lower("name") IN ('admin', 'superadmin', 'super admin');
