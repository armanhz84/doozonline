/* ═══════════════  گوگام آنلاین ← Supabase + Realtime  ═══════════════
   برای راه‌اندازی:
    ۱. برو به supabase.com → New Project
    ۲. توی SQL Editor، فایل schema.sql را اجرا کن
    ۳. از Settings → API، URL و Anon Key را اینجا بگذار
    ۴. برو به Database → Replication → جداول games,moves را فعال کن
   ═══════════════════════════════════════════════════════════════ */

// ─── ماشین حالت ───
const STATE = { LOBBY: "lobby", WAITING: "waiting", PLAYING: "playing" };
let state = STATE.LOBBY;
const $ = (id) => document.getElementById(id);

// ═══ تنظیمات Supabase —  اینا رو عوض کن ═══
const SUPABASE_URL = "https://ufcakzxrtfdjvfzozbnr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmY2FrenhydGZkanZmem96Ym5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NDg5OTgsImV4cCI6MjEwMjMyNDk5OH0.GqstWEdsSnEByPT6jfIi2KoqaBKgDaByqIwMeqKoJbQ";

let supabase = null;
let isOnline = false;
try {
  if (SUPABASE_URL.includes("YOUR-PROJECT")) throw new Error("Not configured");
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  isOnline = true;
} catch (e) {
  console.warn("Supabase not configured. Using OFFLINE mode (2-player hot-seat).");
}

/* ═══ وضعیت اتصال در UI ═══ */
function updateConnectionStatus() {
  const el = $("statusMsg");
  if (isOnline) {
    el.textContent = "🟢 آنلاین — متصل به سرور";
    el.style.color = "var(--teal)";
  } else {
    el.textContent = "🟡 حالت آفلاین — دو نفره روی یک دستگاه";
    el.style.color = "var(--gold)";
  }
}
/* ═══ داده‌های بازی ═══ */
const SIZE = 15;
const PAD = 30;
const CELL = (600 - PAD * 2) / (SIZE - 1);
const BLACK = "#1a1a1a";
const WHITE = "#f4f1ea";
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];
const TURN_TIME = 15;

let board = [];
let currentTurn = "black";
let myColor = "black";
let gameId = null;
let gameOver = false;
let winLine = null;
let lastMove = null;
let myName = "";
let opponentName = "منتظر...";
let timerInterval = null;
let timeLeft = 15;
let subscription = null;
let myCoins = 124800;
let entryFee = 500;
let prize = 950;
let offlineMode = false; // true = 2-player hot-seat on same device

const canvas = $("board");
const ctx = canvas.getContext("2d");

const TABLES = [
  { icon: "🏛️", name: "تالار تهران", sub: "برج میلاد", entry: 200, prize: 380, city: "تهران" },
  { icon: "🕌", name: "تالار اصفهان", sub: "نقش جهان", entry: 500, prize: 950, city: "اصفهان" },
  { icon: "🌸", name: "تالار شیراز", sub: "تخت جمشید", entry: 1000, prize: 1900, city: "شیراز" },
  { icon: "🏰", name: "تالار تبریز", sub: "بازار تبریز", entry: 2000, prize: 3800, city: "تبریز" },
  { icon: "🟤", name: "تالار مشهد", sub: "حرم مطهر", entry: 5000, prize: 9500, city: "مشهد" },
];

/* ═══ لابی ═══ */
function renderTables() {
  const container = $("quickTables");
  container.innerHTML = "";
  TABLES.forEach((t, i) => {
    const card = document.createElement("div");
    card.className = "qtable";
    card.innerHTML = `
      <div class="qtable-icon">${t.icon}</div>
      <div class="qtable-info">
        <div class="qtable-name">${t.name}</div>
        <div class="qtable-sub">${t.sub}</div>
      </div>
      <div class="qtable-stats">
        <div class="qtable-entry">💠 ${t.entry.toLocaleString("fa-IR")}</div>
        <div class="qtable-prize">🏆 ${t.prize.toLocaleString("fa-IR")}</div>
      </div>`;
    card.addEventListener("click", () => quickCreate(t));
    container.appendChild(card);
  });
}

function quickCreate(table) {
  const name = $("playerName").value.trim();
  if (!name) { showToast("نام خود را وارد کن"); return; }
  myName = name; entryFee = table.entry; prize = table.prize;
  createGame(table.city);
}

$("playerName").addEventListener("input", (e) => {
  myName = e.target.value.trim() || "آرش";
});

$("btnCreateGame").addEventListener("click", () => {
  const name = $("playerName").value.trim();
  if (!name) { showToast("نام خود را وارد کن"); return; }
  myName = name; createGame("اصفهان");
});

$("btnJoinGame").addEventListener("click", () => {
  const name = $("playerName").value.trim();
  const code = $("roomCode").value.trim();
  if (!name) { showToast("نام خود را وارد کن"); return; }
  if (!code) { showToast("کد اتاق را وارد کن"); return; }
  myName = name; joinGame(code);
});

$("btnCancelGame").addEventListener("click", cancelGame);
$("btnBackLobby").addEventListener("click", leaveGame);
$("btnResign").addEventListener("click", resignGame);
$("btnLeave").addEventListener("click", leaveGame);
/* ═══ توابع Supabase / آفلاین ═══ */
function newBoard() {
  return Array.from({length:SIZE}, () => Array(SIZE).fill(0));
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

async function createGame(city) {
  offlineMode = !isOnline;
  gameId = generateRoomCode();
  myColor = "black";
  board = newBoard();
  gameOver = false; winLine = null; lastMove = null;
  currentTurn = "black";
  opponentName = isOnline ? "منتظر حریف..." : "بازیکن ۲ (سفید)";

  if (isOnline && supabase) {
    showToast("ساختن اتاق...");
    const { data, error } = await supabase
      .from("games").insert({
        status: "waiting", player1_name: myName,
        current_turn: "black", board: board,
        city: city, entry_fee: entryFee, prize: prize,
      }).select().single();
    if (error) { showToast("خطا: " + error.message); return; }
    gameId = data.id;
    $("roomCodeDisplay").textContent = data.id.slice(0, 8).toUpperCase();
    showPage(STATE.WAITING);
    showToast("✅ اتاق ساخته شد! کد: " + data.id.slice(0, 8).toUpperCase());
    listenGame(data.id);
  } else {
    // حالت آفلاین
    $("roomCodeDisplay").textContent = gameId;
    $("roomDisplay").style.display = "none";
    $("share-hint").textContent = "🎮 حالت آفلاین: نوبت‌ها را به نفر بعد بده";
    showPage(STATE.WAITING);
    showToast("🎮 حالت آفلاین - بعد از ۳ ثانیه شروع می‌شود");
    setTimeout(() => {
      startGameUI();
    }, 2000);
  }
}

async function joinGame(code) {
  if (!isOnline || !supabase) {
    showToast("⚠️ حالت آفلاین: نمی‌توانی به اتاق بپیوندی");
    return;
  }
  showToast("در حال پیوستن...");
  const { data, error } = await supabase
    .from("games").select("*")
    .or(`id.eq.${code},id.ilike.${code}%`)
    .eq("status", "waiting").limit(1);
  if (error) { showToast("خطا: " + error.message); return; }
  if (!data || data.length === 0) { showToast("❌ اتاقی با این کد پیدا نشد"); return; }
  const game = data[0];
  const { error: updateErr } = await supabase
    .from("games").update({ player2_name: myName, status: "playing" })
    .eq("id", game.id);
  if (updateErr) { showToast("خطا: " + updateErr.message); return; }
  gameId = game.id; myColor = "white";
  board = game.board || newBoard();
  currentTurn = game.current_turn || "black";
  gameOver = false; winLine = null; lastMove = null;
  opponentName = game.player1_name;
  entryFee = game.entry_fee || 500; prize = game.prize || 950;
  showToast("✅ به اتاق پیوسته! حریف: " + opponentName);
  startGameUI();
  listenGame(game.id);
}
async function cancelGame() {
  if (gameId && supabase && isOnline) {
    await supabaseClient.from("games").delete().eq("id", gameId);
  }
  cleanup(); showPage(STATE.LOBBY);
}

async function leaveGame() {
  if (gameId && supabase && isOnline && !gameOver) {
    const winner = myColor === "black" ? "white" : "black";
    await supabaseClient.from("games").update({ status: "finished", winner }).eq("id", gameId);
  }
  cleanup(); showPage(STATE.LOBBY); showToast("🚪 خارج شدی");
}

async function resignGame() {
  if (gameOver || !gameId) return;
  const winner = myColor === "black" ? "white" : "black";
  gameOver = true; stopTimer();
  if (isOnline && supabase) {
    await supabaseClient.from("games").update({ status: "finished", winner }).eq("id", gameId);
  }
  showToast("🏳️ تسلیم شدی! " + opponentName + " برنده شد");
  renderBoard();
}

function cleanup() {
  if (subscription) { subscription.unsubscribe(); subscription = null; }
  stopTimer(); gameId = null; gameOver = false;
  winLine = null; lastMove = null; offlineMode = false;
  // دکمه‌های مخفی رو نشون بده
}

/* ═══ Realtime ═══ */
function listenGame(id) {
  if (!supabase) return;
  if (subscription) subscription.unsubscribe();
  subscription = supabase
    .channel("game-" + id)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "games", filter: "id=eq." + id },
      (payload) => {
        const g = payload.new; if (!g) return;
        if (g.status === "playing" && state === STATE.WAITING && myColor === "white") {
          opponentName = g.player1_name; board = g.board || newBoard();
          currentTurn = g.current_turn || "black"; startGameUI();
        }
        if (g.status === "playing" || g.status === "finished") {
          board = g.board || board; currentTurn = g.current_turn || currentTurn;
          if (!gameOver) {
            if (currentTurn === myColor) startTimer(); else stopTimer();
          }
          if (g.status === "finished" && !gameOver) {
            gameOver = true; stopTimer();
            winLine = g.winner ? calcWinLine(g.winner) : null; renderBoard();
            const msg = g.winner === myColor ? "🎉 برنده شدی!" : g.winner === "draw" ? "🤝 مساوی!" : "😞 بازنده شدی!";
            showToast(msg);
          }
          renderBoard(); updateGameUI();
        }
      }
    ).subscribe();
}

/* ═══ نمایش صفحات ═══ */
function showPage(p) {
  state = p;
  ["page-lobby","page-waiting","page-game"].forEach(id => {
    $(id).classList.toggle("hidden", id !== "page-" + p);
  });
  updateConnectionStatus();
}

function startGameUI() {
  showPage(STATE.PLAYING);
  $("gameCity").textContent = "🏛 " + (TABLES.find(t => t.city === "اصفهان")?.name || "اصفهان");
  $("gamePrize").textContent = prize.toLocaleString("fa-IR");
  $("gp1Name").textContent = myColor === "black" ? myName : (offlineMode ? myName : opponentName);
  $("gp2Name").textContent = myColor === "white" ? myName : (offlineMode ? "بازیکن ۲" : opponentName);
  board = board || newBoard(); renderBoard(); updateGameUI(); startTimer();
}

function updateGameUI() {
  const myTurn = !gameOver && currentTurn === myColor;
  const oppTurn = !gameOver && currentTurn !== myColor;

  if (offlineMode) {
    $("gp1Status").textContent = gameOver ? "پایان" : (currentTurn === "black" ? "⚡ نوبت سیاه" : "⏳ صبر کن");
    $("gp2Status").textContent = gameOver ? "پایان" : (currentTurn === "white" ? "⚡ نوبت سفید" : "⏳ صبر کن");
  } else {
    $("gp1Status").textContent = gameOver ? "پایان" : (myColor === "black" ? (myTurn ? "⚡ نوبت تو" : "⏳ صبر کن") : (oppTurn ? "⚡ " + opponentName : "⏳ صبر کن"));
    $("gp2Status").textContent = gameOver ? "پایان" : (myColor === "white" ? (myTurn ? "⚡ نوبت تو" : "⏳ صبر کن") : (oppTurn ? "⚡ " + opponentName : "⏳ صبر کن"));
  }

  const p1 = $("gPlayer1"), p2 = $("gPlayer2");
  if (offlineMode) {
    p1.style.borderColor = currentTurn === "black" ? "rgba(46,196,182,0.5)" : "rgba(255,255,255,0.06)";
    p2.style.borderColor = currentTurn === "white" ? "rgba(46,196,182,0.5)" : "rgba(255,255,255,0.06)";
  } else {
    p1.style.borderColor = (myColor === "black" && myTurn) ? "rgba(46,196,182,0.5)" : "rgba(255,255,255,0.06)";
    p2.style.borderColor = (myColor === "white" && myTurn) ? "rgba(46,196,182,0.5)" : "rgba(255,255,255,0.06)";
  }
  $("gp1Status").classList.toggle("active", myTurn && myColor === "black" || (offlineMode && currentTurn === "black"));
  $("gp2Status").classList.toggle("active", myTurn && myColor === "white" || (offlineMode && currentTurn === "white"));
}
/* ═══ رندر تخته ═══ */
function drawWood(c) {
  const g = c.createLinearGradient(0,0,0,600);
  g.addColorStop(0,"#c98d4e"); g.addColorStop(0.5,"#b07a3c"); g.addColorStop(1,"#965f2b");
  c.fillStyle = g; c.fillRect(0,0,600,600);
}
function drawGrid() {
  ctx.strokeStyle = "rgba(40,24,8,0.85)"; ctx.lineWidth = 1.2;
  for (let i=0; i<SIZE; i++) {
    const p = PAD + i*CELL;
    ctx.beginPath(); ctx.moveTo(PAD,p); ctx.lineTo(600-PAD,p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p,PAD); ctx.lineTo(p,600-PAD); ctx.stroke();
  }
  ctx.fillStyle = "rgba(40,24,8,0.9)";
  [3,7,11].forEach(r => [3,7,11].forEach(c => {
    ctx.beginPath(); ctx.arc(PAD+c*CELL,PAD+r*CELL,3.5,0,Math.PI*2); ctx.fill();
  }));
}
function drawStone(col,row,color,glow) {
  const x = PAD+col*CELL, y = PAD+row*CELL, r = CELL*0.42;
  ctx.save(); ctx.shadowColor="rgba(0,0,0,0.5)"; ctx.shadowBlur=6; ctx.shadowOffsetY=2;
  const g = ctx.createRadialGradient(x-r*0.3,y-r*0.3,r*0.1,x,y,r);
  if(color===BLACK){g.addColorStop(0,"#3a3a3a");g.addColorStop(0.5,"#141414");g.addColorStop(1,"#000");}
  else{g.addColorStop(0,"#fff");g.addColorStop(0.6,"#e9e4d8");g.addColorStop(1,"#c9c2b2");}
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore();
  if(glow){ctx.strokeStyle=color===BLACK?"rgba(46,196,182,0.9)":"rgba(255,215,130,0.9)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r+3,0,Math.PI*2);ctx.stroke();}
}
function renderBoard() {
  ctx.clearRect(0,0,600,600); drawWood(ctx); drawGrid();
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    if(board[r][c]===1) drawStone(c,r,BLACK,lastMove&&lastMove[0]===c&&lastMove[1]===r);
    else if(board[r][c]===2) drawStone(c,r,WHITE,lastMove&&lastMove[0]===c&&lastMove[1]===r);
  }
  if(winLine){const[r1,c1,r2,c2]=winLine;ctx.save();ctx.strokeStyle="rgba(255,95,95,0.95)";ctx.lineWidth=5;ctx.lineCap="round";ctx.shadowColor="rgba(255,95,95,0.8)";ctx.shadowBlur=10;ctx.beginPath();ctx.moveTo(PAD+c1*CELL,PAD+r1*CELL);ctx.lineTo(PAD+c2*CELL,PAD+r2*CELL);ctx.stroke();ctx.restore();}
}
function checkWin(row,col,mark){
  for(const[dr,dc]of DIRS){let cnt=1,r1=row,c1=col,r2=row,c2=col;
    let rr=row+dr,cc=col+dc;while(rr>=0&&rr<SIZE&&cc>=0&&cc<SIZE&&board[rr][cc]===mark){cnt++;r2=rr;c2=cc;rr+=dr;cc+=dc;}
    rr=row-dr;cc=col-dc;while(rr>=0&&rr<SIZE&&cc>=0&&cc<SIZE&&board[rr][cc]===mark){cnt++;r1=rr;c1=cc;rr-=dr;cc-=dc;}
    if(cnt>=5)return[r1,c1,r2,c2];}return null;
}
function calcWinLine(color){const mark=color===myColor?(myColor==="black"?1:2):(myColor==="black"?2:1);for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(board[r][c]===mark){const w=checkWin(r,c,mark);if(w)return w;}return null;}
function isBoardFull(){for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(!board[r][c])return false;return true;}

/* ═══ تایمر ═══ */
function startTimer(){stopTimer();timeLeft=TURN_TIME;updateTimerDisplay();timerInterval=setInterval(()=>{timeLeft--;updateTimerDisplay();if(timeLeft<=0){stopTimer();if(!gameOver&&currentTurn===myColor)makeRandomMove();}},1000);}
function stopTimer(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;}}
function updateTimerDisplay(){const el=$("timerNum");el.textContent=timeLeft;el.classList.toggle("urgent",timeLeft<=4);}

/* ═══ حرکت ═══ */
async function makeMove(row,col){
  if(gameOver||(currentTurn!==myColor&&!offlineMode)) return;
  const mark = offlineMode ? (currentTurn==="black"?1:2) : (myColor==="black"?1:2);
  board[row][col]=mark; lastMove=[col,row];
  const w=checkWin(row,col,mark);
  let newStatus="playing",winner=null;
  if(w){newStatus="finished";winner=offlineMode?currentTurn:myColor;gameOver=true;stopTimer();winLine=w;}
  else if(isBoardFull()){newStatus="finished";winner="draw";gameOver=true;stopTimer();}
  const nextTurn = currentTurn==="black"?"white":"black";
  if(offlineMode){
    currentTurn=nextTurn;renderBoard();updateGameUI();
    if(gameOver){const msg=winner==="draw"?"🤝 مساوی!":`🎉 ${winner==="black"?"سیاه":"سفید"} برنده شد!`;showToast(msg);}
    if(!gameOver)startTimer(); return;
  }
  if(supabase&&gameId&&isOnline){
    const{error}=await supabaseClient.from("games").update({board,current_turn:newStatus==="finished"?currentTurn:nextTurn,status:newStatus,winner,last_move:{row,col,color:myColor}}).eq("id",gameId);
    if(!error) await supabaseClient.from("moves").insert({game_id:gameId,player_name:myName,stone:myColor,row_pos:row,col_pos:col});
  }
  renderBoard();updateGameUI();
  if(gameOver){const msg=winner===myColor?"🎉 برنده شدی!":winner==="draw"?"🤝 مساوی!":"";if(msg)showToast(msg);}
  if(!gameOver)startTimer();
}
function makeRandomMove(){const empty=[];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(board[r][c]===0)empty.push([r,c]);if(empty.length===0)return;const[r,c]=empty[Math.floor(Math.random()*empty.length)];makeMove(r,c);}

/* ═══ کلیک روی تخته ═══ */
function canvasClick(e){
  if(gameOver||(currentTurn!==myColor&&!offlineMode)) return;
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)*(600/rect.width);
  const y=(e.clientY-rect.top)*(600/rect.height);
  const col=Math.round((x-PAD)/CELL); const row=Math.round((y-PAD)/CELL);
  if(row<0||row>=SIZE||col<0||col>=SIZE) return;
  if(board[row][col]!==0) return;
  makeMove(row,col);
}
canvas.addEventListener("pointerdown",canvasClick);

/* ═══ Toast ═══ */
let toastTimeout=null;
function showToast(msg){
  const el=$("toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>el.classList.remove("show"),2600);
}

/* ═══ راه‌اندازی ═══ */
renderTables();
$("playerName").value="آرش"; myName="آرش";
showPage(STATE.LOBBY);
updateConnectionStatus();
showToast(isOnline?"🟢 آنلاین! اتاق بساز یا با کد بپیوند.":"🟡 آفلاین — دو نفره روی یک دستگاه بازی کن");
