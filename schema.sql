-- ═══════════════════════════════════════════════════════════════
-- گوگام آنلاین — Schema پایگاه داده Supabase
-- ═══════════════════════════════════════════════════════════════
-- ۱. این اسکریپت را در SQL Editor پروژه Supabase اجرا کن
-- ۲. بعد از اجرا، از بخش Replication > Realtime هر دو جدول را فعال کن
-- ═══════════════════════════════════════════════════════════════

-- ========================
-- جدول بازی‌ها
-- ========================
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'playing', 'finished')),

  player1_name TEXT NOT NULL,        -- سازنده بازی (سیاه / X)
  player2_name TEXT DEFAULT NULL,    -- نفر دوم (سفید / O)

  player1_coins INT DEFAULT 0,      -- سکه قبل از بازی
  player2_coins INT DEFAULT 0,

  current_turn TEXT NOT NULL DEFAULT 'black'
    CHECK (current_turn IN ('black', 'white')),

  board JSONB NOT NULL,             -- آرایه ۱۵×۱۵
  last_move JSONB DEFAULT NULL,     -- { row, col, color }

  winner TEXT DEFAULT NULL
    CHECK (winner IN (NULL, 'black', 'white', 'draw')),

  city TEXT DEFAULT 'اصفهان',
  entry_fee INT DEFAULT 500,
  prize INT DEFAULT 950
);

-- ========================
-- جدول حرکت‌ها (تاریخچه)
-- ========================
CREATE TABLE IF NOT EXISTS moves (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  stone TEXT NOT NULL CHECK (stone IN ('black', 'white')),
  row_pos INT NOT NULL,
  col_pos INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ایندکس برای جستجوی سریع
CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

-- ========================
-- Realtime را روشن کن
-- ========================
-- برو به: Project Settings > API > Realtime > Replication
-- و جداول "games" و "moves" را فعال کن
-- یا دستورهای زیر را در SQL Editor اجرا کن:

ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE moves;