import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUniverseStore } from '../../stores';

const FEATURE_META: Record<string, { icon: string; title: string; desc: string }> = {
  streamers:          { icon: '📡', title: 'Streamers',          desc: 'Watch top DamCash streamers live on-platform.' },
  broadcasts:         { icon: '📼', title: 'Broadcasts',         desc: 'Follow over-the-board tournaments in real time.' },
  'game-of-the-day':  { icon: '🎬', title: 'Game of the Day',   desc: 'A curated, annotated game selected every day.' },
  teams:              { icon: '🏘️', title: 'Teams',              desc: 'Create or join clubs and compete as a team.' },
  forum:              { icon: '💬', title: 'Forum',              desc: 'Discuss chess, draughts, strategy and more.' },
  blog:               { icon: '📰', title: 'Blog',               desc: 'News, analysis and community posts.' },
  simuls:             { icon: '🏅', title: 'Simuls',             desc: 'One master vs many simultaneous games.' },
  'opening-explorer': { icon: '📚', title: 'Opening Explorer',   desc: 'Browse openings and their statistics from millions of games.' },
  'board-editor':     { icon: '🏗️', title: 'Board Editor',      desc: 'Set up custom positions and share them with friends.' },
  'game-importer':    { icon: '⚙️', title: 'Game Importer',     desc: 'Import PGN or PDN game files for analysis.' },
  puzzles:            { icon: '🧩', title: 'Puzzles',            desc: 'Tactical puzzles for all skill levels.' },
  'puzzle-streak':    { icon: '🔢', title: 'Puzzle Streak',      desc: 'How many puzzles can you solve without a mistake?' },
  'puzzle-storm':     { icon: '🕐', title: 'Puzzle Storm',       desc: 'Solve as many puzzles as possible in 3 minutes.' },
  'chess-basics':     { icon: '📖', title: 'Chess Basics',       desc: 'Learn how pieces move, the rules, and etiquette.' },
  'draughts-rules':   { icon: '📖', title: 'Draughts Rules',     desc: 'Learn International, Frisian and variant rules.' },
  coordinates:        { icon: '📝', title: 'Coordinates',        desc: 'Train yourself to name squares instantly.' },
  'my-studies':       { icon: '🗂️', title: 'My Studies',        desc: 'Your saved analysis sessions and notes.' },
  'all-studies':      { icon: '📡', title: 'All Studies',        desc: 'Community-shared study collections.' },
  'endgame-training': { icon: '👨‍💻', title: 'Endgame Training', desc: 'Master theoretical endgames with guided practice.' },
  'opening-theory':   { icon: '🗂️', title: 'Opening Theory',    desc: 'Study popular draughts openings and variations.' },
  'tactics-guide':    { icon: '📝', title: 'Tactics Guide',      desc: 'Captures, forks, tempo and combinational play.' },
  'endgame-trainer':  { icon: '🎯', title: 'Endgame Trainer',    desc: 'Master king-and-men endgames step by step.' },
  'frisian-championship': { icon: '🏅', title: 'Frisian Championship', desc: 'Top Frisian draughts events.' },
  'world-rankings':   { icon: '🌍', title: 'World Rankings',     desc: 'Official KNDB-style international rankings.' },
  'practice-mode':    { icon: '🎓', title: 'Practice Mode',      desc: 'Learn draughts rules at your own pace.' },
  'draughts-puzzles': { icon: '🧩', title: 'Draughts Puzzles',   desc: 'Tactical draughts problems for all levels.' },
  'pdn-importer':     { icon: '⚙️', title: 'PDN Importer',      desc: 'Import Portable Draughts Notation files.' },
};

export const ComingSoonPage: React.FC = () => {
  const { feature } = useParams<{ feature: string }>();
  const { universe } = useUniverseStore();
  const navigate = useNavigate();

  const meta = feature ? FEATURE_META[feature] : null;
  const icon  = meta?.icon  ?? '🔧';
  const title = meta?.title ?? 'Feature';
  const desc  = meta?.desc  ?? 'This feature is currently under development.';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 20,
      padding: '40px 20px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 72 }}>{icon}</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-1)' }}>{title}</h1>
      <p style={{ fontSize: 15, color: 'var(--text-2)', maxWidth: 420, lineHeight: 1.6 }}>{desc}</p>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--accent-dim)',
        border: '1px solid var(--accent)',
        borderRadius: 30,
        padding: '8px 20px',
        color: 'var(--accent)',
        fontWeight: 700,
        fontSize: 13,
      }}>
        🚧 Coming soon
      </div>
      <button
        className="btn btn-secondary"
        style={{ marginTop: 8 }}
        onClick={() => navigate(`/${universe}`)}
      >
        ← Back to lobby
      </button>
    </div>
  );
};
