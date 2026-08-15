-- ═══════════════════════════════════════════════════════
-- گوگام آنلاین — ایجاد جداول + فعالسازی Realtime
-- ═══════════════════════════════════════════════════════
-- این اسکریپت: ۱) جداول را می‌سازد ۲) RLS را غیرفعال می‌کند
-- ۳) Realtime را فعال می‌کند
-- ═══════════════════════════════════════════════════════

-- ۱. جدول بازی‌ها
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT ''waiting'' CHECK (status IN (''waiting'', ''playing'', ''finished'')),
  player1_name TEXT NOT NULL,
  player2_name TEXT DEFAULT NULL,
  player1_coins INT DEFAULT 0,
  player2_coins INT DEFAULT 0,
  current_turn TEXT NOT NULL DEFAULT ''black'' CHECK (current_turn IN (''black'', ''white'')),
  board JSONB NOT NULL,
  last_move JSONB DEFAULT NULL,
  winner TEXT DEFAULT NULL CHECK (winner IN (NULL, ''black'', ''white'', ''draw'')),
  city TEXT DEFAULT ''اصفهان'',
  entry_fee INT DEFAULT 500,
  prize INT DEFAULT 950
);

-- ۲. غیرفعالسازی RLS (اجازه دسترسی به همه)
ALTER TABLE games DISABLE ROW LEVEL SECURITY;

-- ۳. جدول حرکت‌ها
CREATE TABLE IF NOT EXISTS moves (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  stone TEXT NOT NULL CHECK (stone IN (''black'', ''white'')),
  row_pos INT NOT NULL,
  col_pos INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ۴. غیرفعالسازی RLS برای moves
ALTER TABLE moves DISABLE ROW LEVEL SECURITY;

-- ۵. ایندکس‌ها
CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

-- ۶. فعالسازی Realtime برای هر دو جدول
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE moves;

-- ✅ انجام شد!
SELECT ''✅ جداول ساخته شدند، RLS غیرفعال و Realtime فعال شد!'' AS result;
