/*
  # Restore deleted users
  
  1. Changes
    - Restore the two users that were previously in the system
    - Maintain their original IDs, emails and roles
    - Set proper timestamps
    
  2. Security
    - Users are created with proper roles
    - Maintain RLS policies
*/

-- Restore the two original users if they don't exist
INSERT INTO users (id, email, role, created_at, updated_at)
SELECT 
  '1e4f9cb2-f4b7-428e-9e3a-e7ae32d4e329'::uuid,
  'riccardo.scrocca@gmail.com',
  'doctor',
  '2025-04-22 00:04:28.801136+00'::timestamptz,
  '2025-04-22 00:04:28.801136+00'::timestamptz
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE id = '1e4f9cb2-f4b7-428e-9e3a-e7ae32d4e329'::uuid
);

INSERT INTO users (id, email, role, created_at, updated_at)
SELECT 
  'fab8a46f-d4ff-4222-bbab-ba4c9f3e7d33'::uuid,
  'superadmin@mediscribe.ai',
  'admin',
  '2025-04-22 00:43:54.779952+00'::timestamptz,
  '2025-04-22 00:43:54.779952+00'::timestamptz
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE id = 'fab8a46f-d4ff-4222-bbab-ba4c9f3e7d33'::uuid
);