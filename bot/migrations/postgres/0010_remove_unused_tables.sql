-- Drop tables whose features were removed and that no code reads or writes any more.
-- This deletes their data for good; restore only from a backup or a Neon branch.
--   * co-op (2-player) trial tests, removed 2026-11-14 (old attempts stay in trial_test_results)
--   * friends: friendships, requests, invite links and blocks, removed 2026-11-15
--   * the registration survey (user_onboarding), removed 2026-11-15
--   * user_progress_summary, never read or written by the application
DROP TABLE IF EXISTS
    trial_test_coop_results,
    trial_test_coop_answers,
    trial_test_coop_participants,
    trial_test_coop_invites,
    trial_test_coop_sessions,
    friendships,
    friend_requests,
    friend_invites,
    blocks,
    user_onboarding,
    user_progress_summary;
