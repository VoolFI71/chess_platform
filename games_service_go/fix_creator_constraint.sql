-- Fix chk_games_has_creator constraint to support anonymous games via session_id
-- This constraint should allow games to have either:
-- 1. white_id OR black_id (for authenticated users)
-- 2. OR white_session_id OR black_session_id in metadata (for anonymous users)

-- Drop the old constraint
ALTER TABLE games DROP CONSTRAINT IF EXISTS chk_games_has_creator;

-- Create new constraint that checks both user_id and session_id in metadata
ALTER TABLE games ADD CONSTRAINT chk_games_has_creator 
CHECK (
  -- Either has a user_id (authenticated user)
  (white_id IS NOT NULL OR black_id IS NOT NULL) OR
  -- Or has a session_id in metadata (anonymous user)
  (
    (metadata->>'white_session_id' IS NOT NULL AND metadata->>'white_session_id' != '') OR
    (metadata->>'black_session_id' IS NOT NULL AND metadata->>'black_session_id' != '')
  )
);

