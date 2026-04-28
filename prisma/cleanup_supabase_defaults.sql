-- Drop all Supabase boilerplate tables that are NOT part of the DamCash Prisma schema.
-- Our tables: "User", "Wallet", "Transaction", "Match", "Friend",
--             "CorrespondenceGame", "Tournament", "TournamentPlayer", "PuzzleProgress"
-- Everything else is Supabase sample/demo data and can be removed.

DO $$
DECLARE
    t TEXT;
    our_tables TEXT[] := ARRAY[
        'User','Wallet','Transaction','Match','Friend',
        'CorrespondenceGame','Tournament','TournamentPlayer','PuzzleProgress'
    ];
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename != ALL(our_tables)
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
        RAISE NOTICE 'Dropped table: %', t;
    END LOOP;
END;
$$;
