-- =========================================================
-- AttendTrack Demo Seed Data
-- =========================================================
-- IMPORTANT: Run schema.sql first!
-- IMPORTANT: Create the 3 auth users in Supabase Auth BEFORE running this:
--   admin@demo.com / demo1234
--   scanner@demo.com / demo1234
--   viewer@demo.com / demo1234
-- Then replace the UUIDs below with the actual auth user IDs.
-- =========================================================

-- Step 1: Insert Roles
INSERT INTO roles (id, name, permissions) VALUES
(
  'aaaaaaaa-0001-0000-0000-000000000000',
  'Admin',
  '{
    "view_trainings": true,
    "manage_trainings": true,
    "manage_participants": true,
    "scan_qr": true,
    "view_reports": true,
    "manage_users": true
  }'
),
(
  'aaaaaaaa-0002-0000-0000-000000000000',
  'Scanner',
  '{
    "view_trainings": true,
    "manage_trainings": false,
    "manage_participants": false,
    "scan_qr": true,
    "view_reports": false,
    "manage_users": false
  }'
),
(
  'aaaaaaaa-0003-0000-0000-000000000000',
  'Viewer',
  '{
    "view_trainings": true,
    "manage_trainings": false,
    "manage_participants": false,
    "scan_qr": false,
    "view_reports": true,
    "manage_users": false
  }'
)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- NOTE: Staff users are linked to Supabase Auth.
-- After creating auth users, run this with their actual UUIDs:
--
-- INSERT INTO staff_users (id, name, email, role_id, is_active) VALUES
--   ('<admin-auth-uuid>', 'Admin User', 'admin@demo.com', 'aaaaaaaa-0001-0000-0000-000000000000', true),
--   ('<scanner-auth-uuid>', 'Scanner User', 'scanner@demo.com', 'aaaaaaaa-0002-0000-0000-000000000000', true),
--   ('<viewer-auth-uuid>', 'Viewer User', 'viewer@demo.com', 'aaaaaaaa-0003-0000-0000-000000000000', true);
-- =========================================================

-- Step 2: Insert 25 Participants with Uzbek names
INSERT INTO participants (id, full_name, phone, email, qr_token) VALUES
('bbbbbbbb-0001-0000-0000-000000000000', 'Dilnoza Yusupova', '+998901234501', 'dilnoza@example.uz', 'qr_dilnoza_a1b2c3d4e5f60001'),
('bbbbbbbb-0002-0000-0000-000000000000', 'Bobur Karimov', '+998901234502', 'bobur@example.uz', 'qr_bobur_a1b2c3d4e5f60002'),
('bbbbbbbb-0003-0000-0000-000000000000', 'Zulfiya Toshmatova', '+998901234503', NULL, 'qr_zulfiya_a1b2c3d4e5f60003'),
('bbbbbbbb-0004-0000-0000-000000000000', 'Sardor Rahimov', '+998901234504', 'sardor@example.uz', 'qr_sardor_a1b2c3d4e5f60004'),
('bbbbbbbb-0005-0000-0000-000000000000', 'Malika Hasanova', '+998901234505', NULL, 'qr_malika_a1b2c3d4e5f60005'),
('bbbbbbbb-0006-0000-0000-000000000000', 'Jasur Mirzayev', '+998901234506', 'jasur@example.uz', 'qr_jasur_a1b2c3d4e5f60006'),
('bbbbbbbb-0007-0000-0000-000000000000', 'Feruza Nazarova', '+998901234507', NULL, 'qr_feruza_a1b2c3d4e5f60007'),
('bbbbbbbb-0008-0000-0000-000000000000', 'Ulugbek Xolmatov', '+998901234508', 'ulugbek@example.uz', 'qr_ulugbek_a1b2c3d4e5f60008'),
('bbbbbbbb-0009-0000-0000-000000000000', 'Nilufar Qodirov', '+998901234509', NULL, 'qr_nilufar_a1b2c3d4e5f60009'),
('bbbbbbbb-0010-0000-0000-000000000000', 'Sherzod Tursunov', '+998901234510', 'sherzod@example.uz', 'qr_sherzod_a1b2c3d4e5f60010'),
('bbbbbbbb-0011-0000-0000-000000000000', 'Mushtariy Ergasheva', '+998901234511', NULL, 'qr_mushtariy_a1b2c3d4e5f60011'),
('bbbbbbbb-0012-0000-0000-000000000000', 'Otabek Normatov', '+998901234512', 'otabek@example.uz', 'qr_otabek_a1b2c3d4e5f60012'),
('bbbbbbbb-0013-0000-0000-000000000000', 'Mohira Sultonova', '+998901234513', NULL, 'qr_mohira_a1b2c3d4e5f60013'),
('bbbbbbbb-0014-0000-0000-000000000000', 'Asilbek Umarov', '+998901234514', 'asilbek@example.uz', 'qr_asilbek_a1b2c3d4e5f60014'),
('bbbbbbbb-0015-0000-0000-000000000000', 'Dildora Sotvoldiyeva', '+998901234515', NULL, 'qr_dildora_a1b2c3d4e5f60015'),
('bbbbbbbb-0016-0000-0000-000000000000', 'Mansur Qosimov', '+998901234516', 'mansur@example.uz', 'qr_mansur_a1b2c3d4e5f60016'),
('bbbbbbbb-0017-0000-0000-000000000000', 'Shoira Yuldosheva', '+998901234517', NULL, 'qr_shoira_a1b2c3d4e5f60017'),
('bbbbbbbb-0018-0000-0000-000000000000', 'Islom Baxtiyorov', '+998901234518', 'islom@example.uz', 'qr_islom_a1b2c3d4e5f60018'),
('bbbbbbbb-0019-0000-0000-000000000000', 'Gulnora Xasanova', '+998901234519', NULL, 'qr_gulnora_a1b2c3d4e5f60019'),
('bbbbbbbb-0020-0000-0000-000000000000', 'Nodir Rajabov', '+998901234520', 'nodir@example.uz', 'qr_nodir_a1b2c3d4e5f60020'),
('bbbbbbbb-0021-0000-0000-000000000000', 'Lola Mirzaeva', '+998901234521', NULL, 'qr_lola_a1b2c3d4e5f60021'),
('bbbbbbbb-0022-0000-0000-000000000000', 'Husan Abdullayev', '+998901234522', 'husan@example.uz', 'qr_husan_a1b2c3d4e5f60022'),
('bbbbbbbb-0023-0000-0000-000000000000', 'Maftuna Boltayeva', '+998901234523', NULL, 'qr_maftuna_a1b2c3d4e5f60023'),
('bbbbbbbb-0024-0000-0000-000000000000', 'Bekzod Holiqov', '+998901234524', 'bekzod@example.uz', 'qr_bekzod_a1b2c3d4e5f60024'),
('bbbbbbbb-0025-0000-0000-000000000000', 'Sabohat Yusupov', '+998901234525', NULL, 'qr_sabohat_a1b2c3d4e5f60025')
ON CONFLICT (id) DO NOTHING;

-- Step 3: Insert 3 Trainings
-- Active training (Web Dev) - started 8 weeks ago, Saturdays
INSERT INTO trainings (id, name, description, color, start_date, end_date, schedule_day, schedule_time, status, attendance_threshold) VALUES
(
  'cccccccc-0001-0000-0000-000000000000',
  'Veb-dasturlash kursi',
  'Front-end va back-end dasturlash asoslari. HTML, CSS, JavaScript va Node.js',
  '#3B82F6',
  CURRENT_DATE - INTERVAL '56 days',
  CURRENT_DATE + INTERVAL '28 days',
  6, -- Saturday
  '09:00',
  'active',
  75
),
-- Upcoming training (Data Analysis) - starts next month
(
  'cccccccc-0002-0000-0000-000000000000',
  'Ma''lumotlar tahlili',
  'Python va Excel yordamida ma''lumotlarni tahlil qilish va vizualizatsiya',
  '#10B981',
  CURRENT_DATE + INTERVAL '14 days',
  CURRENT_DATE + INTERVAL '112 days',
  6, -- Saturday
  '14:00',
  'upcoming',
  80
),
-- Completed training (English) - ended 2 weeks ago
(
  'cccccccc-0003-0000-0000-000000000000',
  'Ingliz tili kursi',
  'Biznes ingliz tili va muloqot ko''nikmalari',
  '#8B5CF6',
  CURRENT_DATE - INTERVAL '84 days',
  CURRENT_DATE - INTERVAL '14 days',
  6, -- Saturday
  '11:00',
  'completed',
  80
)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Generate Sessions for Web Dev (Active) - 8 past + 1 today/upcoming
INSERT INTO sessions (training_id, session_number, session_date, session_time, status) VALUES
('cccccccc-0001-0000-0000-000000000000', 1, CURRENT_DATE - INTERVAL '56 days', '09:00', 'closed'),
('cccccccc-0001-0000-0000-000000000000', 2, CURRENT_DATE - INTERVAL '49 days', '09:00', 'closed'),
('cccccccc-0001-0000-0000-000000000000', 3, CURRENT_DATE - INTERVAL '42 days', '09:00', 'closed'),
('cccccccc-0001-0000-0000-000000000000', 4, CURRENT_DATE - INTERVAL '35 days', '09:00', 'closed'),
('cccccccc-0001-0000-0000-000000000000', 5, CURRENT_DATE - INTERVAL '28 days', '09:00', 'closed'),
('cccccccc-0001-0000-0000-000000000000', 6, CURRENT_DATE - INTERVAL '21 days', '09:00', 'closed'),
('cccccccc-0001-0000-0000-000000000000', 7, CURRENT_DATE - INTERVAL '14 days', '09:00', 'closed'),
('cccccccc-0001-0000-0000-000000000000', 8, CURRENT_DATE - INTERVAL '7 days', '09:00', 'closed'),
('cccccccc-0001-0000-0000-000000000000', 9, CURRENT_DATE + INTERVAL '0 days', '09:00', 'open'),
('cccccccc-0001-0000-0000-000000000000', 10, CURRENT_DATE + INTERVAL '7 days', '09:00', 'upcoming'),
('cccccccc-0001-0000-0000-000000000000', 11, CURRENT_DATE + INTERVAL '14 days', '09:00', 'upcoming'),
('cccccccc-0001-0000-0000-000000000000', 12, CURRENT_DATE + INTERVAL '21 days', '09:00', 'upcoming')
ON CONFLICT (training_id, session_number) DO NOTHING;

-- Sessions for Completed English course
INSERT INTO sessions (training_id, session_number, session_date, session_time, status) VALUES
('cccccccc-0003-0000-0000-000000000000', 1, CURRENT_DATE - INTERVAL '84 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 2, CURRENT_DATE - INTERVAL '77 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 3, CURRENT_DATE - INTERVAL '70 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 4, CURRENT_DATE - INTERVAL '63 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 5, CURRENT_DATE - INTERVAL '56 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 6, CURRENT_DATE - INTERVAL '49 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 7, CURRENT_DATE - INTERVAL '42 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 8, CURRENT_DATE - INTERVAL '35 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 9, CURRENT_DATE - INTERVAL '28 days', '11:00', 'closed'),
('cccccccc-0003-0000-0000-000000000000', 10, CURRENT_DATE - INTERVAL '21 days', '11:00', 'closed')
ON CONFLICT (training_id, session_number) DO NOTHING;

-- Step 5: Enroll participants in trainings
-- All 25 in Web Dev
INSERT INTO training_participants (training_id, participant_id)
SELECT 'cccccccc-0001-0000-0000-000000000000', id FROM participants
WHERE id LIKE 'bbbbbbbb-%'
ON CONFLICT DO NOTHING;

-- First 15 in English (completed)
INSERT INTO training_participants (training_id, participant_id)
SELECT 'cccccccc-0003-0000-0000-000000000000', id FROM participants
WHERE id IN (
  'bbbbbbbb-0001-0000-0000-000000000000',
  'bbbbbbbb-0002-0000-0000-000000000000',
  'bbbbbbbb-0003-0000-0000-000000000000',
  'bbbbbbbb-0004-0000-0000-000000000000',
  'bbbbbbbb-0005-0000-0000-000000000000',
  'bbbbbbbb-0006-0000-0000-000000000000',
  'bbbbbbbb-0007-0000-0000-000000000000',
  'bbbbbbbb-0008-0000-0000-000000000000',
  'bbbbbbbb-0009-0000-0000-000000000000',
  'bbbbbbbb-0010-0000-0000-000000000000',
  'bbbbbbbb-0011-0000-0000-000000000000',
  'bbbbbbbb-0012-0000-0000-000000000000',
  'bbbbbbbb-0013-0000-0000-000000000000',
  'bbbbbbbb-0014-0000-0000-000000000000',
  'bbbbbbbb-0015-0000-0000-000000000000'
)
ON CONFLICT DO NOTHING;

-- Step 6: Generate realistic attendance for Web Dev sessions 1-8
-- Participants with high attendance: 0001-0010
-- Medium: 0011-0018
-- Low: 0019-0025

DO $$
DECLARE
  sess_id UUID;
  part_id UUID;
  sess_num INTEGER;
  rand_val FLOAT;
  att_status TEXT;
  sessions_cursor CURSOR FOR
    SELECT id, session_number FROM sessions
    WHERE training_id = 'cccccccc-0001-0000-0000-000000000000'
    AND status = 'closed'
    ORDER BY session_number;
  participants_cursor CURSOR FOR
    SELECT participant_id FROM training_participants
    WHERE training_id = 'cccccccc-0001-0000-0000-000000000000';
BEGIN
  FOR sess_rec IN sessions_cursor LOOP
    sess_id := sess_rec.id;
    sess_num := sess_rec.session_number;

    FOR part_rec IN participants_cursor LOOP
      part_id := part_rec.participant_id;
      rand_val := random();

      -- Determine attendance rate based on participant number
      DECLARE
        part_num INTEGER;
        attendance_chance FLOAT;
      BEGIN
        part_num := CAST(SUBSTRING(part_id::TEXT FROM 10 FOR 4) AS INTEGER);

        IF part_num <= 10 THEN
          attendance_chance := 0.90; -- High attendance
        ELSIF part_num <= 18 THEN
          attendance_chance := 0.72; -- Medium attendance
        ELSE
          attendance_chance := 0.55; -- Low attendance
        END IF;

        IF rand_val < attendance_chance * 0.85 THEN
          att_status := 'present';
        ELSIF rand_val < attendance_chance THEN
          att_status := 'late';
        ELSIF rand_val < attendance_chance + 0.05 THEN
          att_status := 'excused';
        ELSE
          att_status := 'absent';
        END IF;

        INSERT INTO attendance (session_id, participant_id, status,
          scanned_at, synced_from_offline)
        VALUES (
          sess_id, part_id, att_status,
          CASE WHEN att_status IN ('present', 'late')
            THEN (CURRENT_TIMESTAMP - (sess_num * 7) * INTERVAL '1 day' + (random() * 60 + 5) * INTERVAL '1 minute')::TIMESTAMPTZ
            ELSE NULL
          END,
          FALSE
        )
        ON CONFLICT DO NOTHING;
      END;
    END LOOP;
  END LOOP;
END $$;

-- Generate attendance for English course (all closed)
DO $$
DECLARE
  sess_id UUID;
  part_id UUID;
  rand_val FLOAT;
  att_status TEXT;
BEGIN
  FOR sess_rec IN (
    SELECT id FROM sessions
    WHERE training_id = 'cccccccc-0003-0000-0000-000000000000'
    AND status = 'closed'
  ) LOOP
    FOR part_rec IN (
      SELECT participant_id FROM training_participants
      WHERE training_id = 'cccccccc-0003-0000-0000-000000000000'
    ) LOOP
      rand_val := random();
      IF rand_val < 0.75 THEN
        att_status := 'present';
      ELSIF rand_val < 0.82 THEN
        att_status := 'late';
      ELSIF rand_val < 0.88 THEN
        att_status := 'excused';
      ELSE
        att_status := 'absent';
      END IF;

      INSERT INTO attendance (session_id, participant_id, status)
      VALUES (sess_rec.id, part_rec.participant_id, att_status)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
