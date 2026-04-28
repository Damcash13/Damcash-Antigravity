-- Migration: Refined Persistent Friends & Tournament Pairing
-- Adapted for existing Prisma schema (User, Friend, TournamentPlayer, Match tables)

-- 1. Helper RPC for searching users
-- Returns basic profile info for matching usernames
CREATE OR REPLACE FUNCTION search_users(p_query TEXT)
RETURNS TABLE (id UUID, username TEXT, chess_rating INT, checkers_rating INT, country TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.username, u."chessRating", u."checkersRating", u.country
    FROM "User" u
    WHERE u.username ILIKE p_query || '%'
    LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add status column to TournamentPlayer for pairing logic
-- Tracks if a player is 'available', 'searching', or 'in_game'
ALTER TABLE "TournamentPlayer" ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';

-- 3. RPC for Arena-style tournament pairing
-- Finds another available player in the same tournament and creates a match
CREATE OR REPLACE FUNCTION tournament_pair(p_tournament_id UUID)
RETURNS UUID AS $$
DECLARE
    v_opponent_id UUID;
    v_match_id UUID;
    v_time_control TEXT;
    v_universe TEXT;
BEGIN
    -- 1. Get tournament details
    SELECT timeControl, universe INTO v_time_control, v_universe 
    FROM "Tournament" 
    WHERE id = p_tournament_id;

    -- 2. Find an opponent who is 'available' and not the current user
    SELECT "userId" INTO v_opponent_id
    FROM "TournamentPlayer"
    WHERE "tournamentId" = p_tournament_id
      AND "userId" <> auth.uid()
      AND status = 'available'
    ORDER BY random() -- Simple random pairing for arena
    LIMIT 1;

    IF v_opponent_id IS NULL THEN
        -- No opponent found, mark current player as available and return NULL
        UPDATE "TournamentPlayer" SET status = 'available' 
        WHERE "tournamentId" = p_tournament_id AND "userId" = auth.uid();
        RETURN NULL;
    END IF;

    -- 3. Mark both players as 'in_game'
    UPDATE "TournamentPlayer" SET status = 'in_game' 
    WHERE "tournamentId" = p_tournament_id 
      AND ("userId" = auth.uid() OR "userId" = v_opponent_id);

    -- 4. Create the match
    INSERT INTO "Match" ("whiteId", "blackId", "status", "universe", "timeControl", "isRated")
    VALUES (auth.uid(), v_opponent_id, 'playing', v_universe, v_time_control, true)
    RETURNING id INTO v_match_id;

    RETURN v_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
