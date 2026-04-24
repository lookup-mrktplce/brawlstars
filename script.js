// script.js
let gameState = 'loading';
let brawlersConfig = [];
let currentBrawlerIndex = 0;
let playerLevel = 0;

const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
const mainMenu = document.getElementById('main-menu');
const gameCanvas = document.getElementById('game-canvas');
const gameUI = document.getElementById('game-ui');
const winScreen = document.getElementById('win-screen');
const winText = document.getElementById('win-text');
const ctx = gameCanvas.getContext('2d');

let canvasW, canvasH;
let player, bots = [], projectiles = [], gems = [];
let blueScore = 0, redScore = 0;
let gameLoopId;
let gemSpawnTimer = 0;
let isGameOver = false;

const moveJoy = { active: false, dx: 0, dy: 0, id: null };
const attackJoy = { active: false, dx: 0, dy: 0, id: null };

// --- 1. Loading (ИСПРАВЛЕНО) ---
async function loadBrawlerData() {
  try {
    const res = await fetch('data/brawlers.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    brawlersConfig = data.brawlers || [];
    console.log('✅ Бойцы загружены:', brawlersConfig.length);
  } catch (e) {
    console.warn('⚠️ JSON не найден/ошибка сети, используем встроенного Шелли:', e);
    brawlersConfig = [{
      id: "shelly", name: "Shelly", rarity: "Trophy Road", description: "Стартовый боец",
      baseHP: 3600, hpPerLevel: 300, baseDamage: 400, damagePerLevel: 50,
      speed: 3.5, size: 22, image: "data/shelly.png",
      attack: { name: "Buckshot", speed: 8, size: 8, range: 280, shape: "projectile", type: "aimed", maxCharges: 3, reloadSpeed: 1.2, damageType: "normal", freezeDuration: 0, poisonDuration: 0 }
    }];
  }
}

async function initLoading() {
  if (!loadingBar || !loadingText) return;
  
  let progress = 0;
  // Плавная анимация без setInterval
  const animate = () => {
    progress += 3;
    if (progress > 100) progress = 100;
    loadingBar.style.width = `${progress}%`;
    loadingText.textContent = `Загрузка: ${progress}%`;
    if (progress < 100) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  // Грузим данные параллельно
  await loadBrawlerData();

  // Ждем, пока анимация дойдет до 100%
  const waitEnd = setInterval(() => {
    if (progress >= 100) {
      clearInterval(waitEnd);
      loadingText.textContent = 'Готово!';
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        mainMenu.classList.remove('hidden');
        gameState = 'menu';
        updateMenuUI();
      }, 200);
    }
  }, 50);
}

// --- 2. Menu ---
function updateMenuUI() {
  const b = brawlersConfig[currentBrawlerIndex] || brawlersConfig[0];
  document.getElementById('brawler-name').textContent = b.name;
  document.getElementById('brawler-level').textContent = `Уровень: ${playerLevel}`;
  document.getElementById('menu-brawler-img').src = b.image || '';
}
document.getElementById('btn-play').addEventListener('click', startGame);
document.getElementById('btn-menu').addEventListener('click', () => {
  gameUI.classList.add('hidden'); mainMenu.classList.remove('hidden');
  gameState = 'menu'; if (gameLoopId) cancelAnimationFrame(gameLoopId);
});

// --- 3. Game Setup ---
function startGame() {
  gameState = 'playing'; mainMenu.classList.add('hidden'); gameUI.classList.remove('hidden');
  winScreen.classList.add('hidden'); isGameOver = false;
  blueScore = 0; redScore = 0; gems = []; projectiles = []; bots = []; gemSpawnTimer = 0;
  resizeCanvas(); setupPlayer(); spawnBots(); updateUI();
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoop();
}

function setupPlayer() {
  const conf = brawlersConfig[currentBrawlerIndex] || brawlersConfig[0];
  player = {
    team: 'blue', x: canvasW * 0.2, y: canvasH * 0.5,
    maxHP: conf.baseHP + (conf.hpPerLevel * playerLevel), hp: conf.baseHP + (conf.hpPerLevel * playerLevel),
    speed: conf.speed, size: conf.size, damage: conf.baseDamage + (conf.damagePerLevel * playerLevel),
    attackConf: conf.attack, charges: conf.attack.maxCharges, maxCharges: conf.attack.maxCharges,
    reloadTimer: 0, gems: 0, frozen: 0, poison: { active: false, timer: 0, damage: 0, step: 0 },
    alive: true, respawnTimer: 0
  };
}

function spawnBots() {
  for (let i = 0; i < 2; i++) bots.push(createBot('blue', canvasW * 0.15, canvasH * (0.3 + i * 0.4)));
  for (let i = 0; i < 3; i++) bots.push(createBot('red', canvasW * 0.85, canvasH * (0.2 + i * 0.3)));
}

function createBot(team, x, y) {
  const conf = brawlersConfig[0] || { attack: { speed: 6, range: 250, maxCharges: 3, reloadSpeed: 1.4 } };
  return {
    team, x, y, spawnX: x, spawnY: y,
    maxHP: 3000, hp: 3000, speed: 2.5 + Math.random() * 0.8, size: 20,
    damage: 350, attackConf: { ...conf.attack },
    charges: 3, maxCharges: 3, reloadTimer: 0,
    gems: 0, frozen: 0, poison: { active: false },
    dir: Math.random() * Math.PI * 2, dirTimer: 0,
    alive: true, respawnTimer: 0
  };
}

// --- 4. Game Loop ---
function resizeCanvas() { canvasW = window.innerWidth; canvasH = window.innerHeight; gameCanvas.width = canvasW; gameCanvas.height = canvasH; }
window.addEventListener('resize', resizeCanvas);

function gameLoop() {
  if (gameState !== 'playing') return;
  const dt = 1/60; update(dt); draw(); gameLoopId = requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (isGameOver) return;

  gemSpawnTimer += dt;
  if (gemSpawnTimer >= 5) { gemSpawnTimer = 0; gems.push({ x: canvasW/2, y: canvasH/2, picked: false }); }

  // Player
  if (player.alive && player.frozen <= 0) {
    player.x += moveJoy.dx * player.speed; player.y += moveJoy.dy * player.speed;
  }
  player.x = Math.max(player.size, Math.min(canvasW - player.size, player.x));
  player.y = Math.max(player.size, Math.min(canvasH - player.size, player.y));

  if (!player.alive) {
    player.respawnTimer += dt;
    if (player.respawnTimer >= 3) {
      player.alive = true; player.hp = player.maxHP; player.x = canvasW * 0.2; player.y = canvasH * 0.5; player.respawnTimer = 0; player.gems = 0;
    }
  } else {
    if (player.charges < player.maxCharges) {
      player.reloadTimer += dt;
      if (player.reloadTimer >= player.attackConf.reloadSpeed) { player.reloadTimer -= player.attackConf.reloadSpeed; player.charges++; }
    }
    if (attackJoy.active && player.charges > 0 && player.frozen <= 0) {
      const len = Math.hypot(attackJoy.dx, attackJoy.dy);
      if (len > 0.3) { spawnProjectile(player, attackJoy.dx/len, attackJoy.dy/len); player.charges--; attackJoy.active = false; }
    }
    if (player.frozen > 0) player.frozen -= dt;
    applyDoT(player, dt);
  }

  // Bots
  bots.forEach(bot => {
    if (!bot.alive) { bot.respawnTimer += dt; if (bot.respawnTimer >= 3) { bot.alive = true; bot.hp = bot.maxHP; bot.x = bot.spawnX; bot.y = bot.spawnY; bot.respawnTimer = 0; } return; }
    if (bot.frozen <= 0) {
      bot.dirTimer -= dt;
      if (bot.dirTimer <= 0) { bot.dir = Math.random() * Math.PI * 2; bot.dirTimer = 1 + Math.random(); }
      bot.x += Math.cos(bot.dir) * bot.speed; bot.y += Math.sin(bot.dir) * bot.speed;
      bot.x = Math.max(bot.size, Math.min(canvasW - bot.size, bot.x));
      bot.y = Math.max(bot.size, Math.min(canvasH - bot.size, bot.y));

      if (bot.charges < bot.maxCharges) { bot.reloadTimer += dt; if(bot.reloadTimer >= bot.attackConf.reloadSpeed){bot.reloadTimer=0;bot.charges++;}}
      
      // 🤖 Боты стреляют в случайных направлениях
      if (Math.random() < 0.015 && bot.charges > 0) {
        const angle = Math.random() * Math.PI * 2;
        spawnProjectile(bot, Math.cos(angle), Math.sin(angle));
        bot.charges--;
      }
    }
    if (bot.frozen > 0) bot.frozen -= dt;
    applyDoT(bot, dt);
  });

  // Projectiles
  projectiles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.life -= dt;
    if (p.life <= 0 || p.x < -20 || p.x > canvasW+20 || p.y < -20 || p.y > canvasH+20) p.dead = true;

    // 🛡️ Только враги получают урон
    const targets = p.team === 'blue' 
      ? bots.filter(b => b.team === 'red') 
      : [player, ...bots.filter(b => b.team === 'blue')];

    for (let t of targets) {
      if (!t.alive) continue;
      if (Math.hypot(p.x - t.x, p.y - t.y) < t.size + p.size) {
        t.hp -= p.damage; applyStatus(t, p.damageType, p.freezeDur, p.poisonDur); p.dead = true; break;
      }
    }
  });
  projectiles = projectiles.filter(p => !p.dead);

  // Gems
  gems.forEach(g => {
    if (g.picked) return;
    const entities = [player, ...bots];
    for (let e of entities) {
      if (e.alive && Math.hypot(g.x - e.x, g.y - e.y) < e.size + 12) {
        g.picked = true; e.gems++;
        if (e.team === 'blue') blueScore++; else redScore++;
        if (blueScore >= 10) endGame('blue'); if (redScore >= 10) endGame('red');
        break;
      }
    }
  });
  gems = gems.filter(g => !g.picked || g.dropped);

  checkDeath(player, 'blue');
  bots.forEach(b => checkDeath(b, b.team));
}

function checkDeath(entity, team) {
  if (entity.hp <= 0 && entity.alive) {
    entity.alive = false; entity.respawnTimer = 0;
    if (team === 'blue') { blueScore -= entity.gems; blueScore = Math.max(0, blueScore); }
    else { redScore -= entity.gems; redScore = Math.max(0, redScore); }
    for(let i=0;i<entity.gems;i++) gems.push({ x: entity.x + (Math.random()-0.5)*30, y: entity.y + (Math.random()-0.5)*30, dropped: true, picked: false });
    entity.gems = 0;
  }
}

function applyStatus(target, type, freezeDur, poisonDur) {
  if (type === 'freeze') target.frozen = freezeDur;
  if (type === 'poison') target.poison = { active: true, timer: poisonDur, damage: 60, step: 0 };
}

function applyDoT(target, dt) {
  if (!target.poison.active) return;
  target.poison.step += dt;
  if (target.poison.step >= 0.5) { target.hp -= target.poison.damage; target.poison.damage = Math.max(10, target.poison.damage - 8); target.poison.step = 0; }
  target.poison.timer -= dt;
  if (target.poison.timer <= 0) target.poison.active = false;
}

function spawnProjectile(owner, dx, dy) {
  projectiles.push({
    x: owner.x, y: owner.y, vx: dx * owner.attackConf.speed, vy: dy * owner.attackConf.speed,
    size: owner.attackConf.size, damage: owner.damage, team: owner.team,
    life: owner.attackConf.range / owner.attackConf.speed,
    damageType: owner.attackConf.damageType || 'normal',
    freezeDur: owner.attackConf.freezeDuration || 0,
    poisonDur: owner.attackConf.poisonDuration || 0,
    dead: false
  });
}

function endGame(winnerTeam) {
  isGameOver = true; winText.textContent = winnerTeam === 'blue' ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ';
  winText.style.color = winnerTeam === 'blue' ? '#4caf50' : '#f44336';
  winScreen.classList.remove('hidden');
}

// --- 5. Drawing ---
function draw() {
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.strokeStyle = '#3a4a3a'; ctx.lineWidth = 1;
  for (let x=0; x<canvasW; x+=50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvasH); ctx.stroke(); }
  for (let y=0; y<canvasH; y+=50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasW,y); ctx.stroke(); }

  gems.forEach(g => {
    ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.arc(g.x, g.y, 10, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x-4, g.y); ctx.lineTo(g.x+4, g.y); ctx.moveTo(g.x, g.y-4); ctx.lineTo(g.x, g.y+4); ctx.stroke();
  });

  projectiles.forEach(p => {
    ctx.fillStyle = p.team === 'blue' ? '#4d9eff' : '#ff4d4d';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
  });

  const entities = [player, ...bots];
  entities.forEach(e => {
    if (!e.alive) return;
    ctx.fillStyle = e.team === 'blue' ? '#4d9eff' : '#ff4d4d';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();

    const barW = 40, barH = 6, barX = e.x - barW/2, barY = e.y - e.size - 16;
    ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = e.hp/e.maxHP > 0.3 ? '#4caf50' : '#f44336';
    ctx.fillRect(barX, barY, barW * Math.max(0, e.hp/e.maxHP), barH);

    // 🔢 Цифры ХП
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(e.hp), e.x, barY - 4);

    if (e.gems > 0) { ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif'; ctx.fillText(`💎${e.gems}`, e.x, barY - 18); }
    if (e.frozen > 0) { ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, e.size + 6, 0, Math.PI*2); ctx.stroke(); }
  });
}

// --- 6. UI & Input ---
const ammoCont = document.getElementById('ammo-container');
let ammoPips = [];
function initAmmoUI(max) {
  ammoCont.innerHTML = ''; ammoPips = [];
  for (let i=0; i<max; i++) {
    const pip = document.createElement('div'); pip.className = 'ammo-pip empty';
    ammoCont.appendChild(pip); ammoPips.push(pip);
  }
}

function updateUI() {
  if (gameState !== 'playing') { requestAnimationFrame(updateUI); return; }
  const hpPct = Math.max(0, (player.hp / player.maxHP) * 100);
  document.getElementById('hp-bar').style.width = `${hpPct}%`;
  
  if (ammoPips.length !== player.maxCharges) initAmmoUI(player.maxCharges);
  ammoPips.forEach((pip, i) => { pip.className = `ammo-pip ${i >= player.charges ? 'empty' : ''}`; });
  
  document.getElementById('score-display').textContent = `🔵 Синие: ${blueScore} | 🔴 Красные: ${redScore}`;
  requestAnimationFrame(updateUI);
}

function setupJoystick(el, joyState) {
  let startX, startY; const maxDist = 35;
  el.addEventListener('pointerdown', e => { joyState.id = e.pointerId; joyState.active = true; startX = e.clientX; startY = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== joyState.id) return;
    const dx = e.clientX - startX, dy = e.clientY - startY, dist = Math.hypot(dx, dy), clamped = Math.min(dist, maxDist);
    const angle = Math.atan2(dy, dx); joyState.dx = Math.cos(angle) * (clamped / maxDist); joyState.dy = Math.sin(angle) * (clamped / maxDist);
    el.querySelector('.knob').style.transform = `translate(${joyState.dx * 35}px, ${joyState.dy * 35}px)`;
  });
  el.addEventListener('pointerup pointercancel', e => {
    if (e.pointerId !== joyState.id) return;
    joyState.active = false; joyState.dx = 0; joyState.dy = 0; joyState.id = null;
    el.querySelector('.knob').style.transform = `translate(0,0)`; el.releasePointerCapture(e.pointerId);
  });
}
setupJoystick(document.getElementById('move-joystick'), moveJoy);
setupJoystick(document.getElementById('attack-joystick'), attackJoy);

// 🚀 Запуск
initLoading();
