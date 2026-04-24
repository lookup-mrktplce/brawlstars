// script.js
let gameState = 'loading';
let brawlersConfig = [];
let currentBrawlerIndex = 0;
let playerLevel = 0;

// DOM
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
const mainMenu = document.getElementById('main-menu');
const gameCanvas = document.getElementById('game-canvas');
const gameUI = document.getElementById('game-ui');
const winScreen = document.getElementById('win-screen');
const winText = document.getElementById('win-text');

const ctx = gameCanvas.getContext('2d');

// Game State
let canvasW, canvasH;
let player, bots = [], projectiles = [], gems = [];
let blueScore = 0, redScore = 0;
let gameLoopId;
let gemSpawnTimer = 0;
let isGameOver = false;

// Joystick State
const moveJoy = { active: false, dx: 0, dy: 0, id: null };
const attackJoy = { active: false, dx: 0, dy: 0, id: null };

// --- 1. Loading ---
async function initLoading() {
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 8 + 2;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      loadingBar.style.width = '100%';
      loadingText.textContent = 'Загрузка: 100%';
      await loadBrawlerData();
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        mainMenu.classList.remove('hidden');
        gameState = 'menu';
        updateMenuUI();
      }, 400);
    }
    loadingBar.style.width = `${progress}%`;
    loadingText.textContent = `Загрузка: ${Math.floor(progress)}%`;
  }, 50);
}

async function loadBrawlerData() {
  try {
    const res = await fetch('data/brawlers.json');
    brawlersConfig = await res.json();
    console.log('Brawlers loaded:', brawlersConfig);
  } catch (e) {
    console.error('Ошибка загрузки JSON:', e);
    brawlersConfig = [{ id: 'shelly', name: 'Shelly', baseHP: 3600, hpPerLevel: 300, baseDamage: 400, damagePerLevel: 50, speed: 3.5, size: 22, attack: { speed: 8, size: 8, range: 280, shape: 'projectile', type: 'aimed', maxCharges: 3, reloadSpeed: 1.2 } }];
  }
}

// --- 2. Menu ---
function updateMenuUI() {
  const b = brawlersConfig[currentBrawlerIndex];
  document.getElementById('brawler-name').textContent = b.name;
  document.getElementById('brawler-level').textContent = `Уровень: ${playerLevel}`;
  document.getElementById('menu-brawler-img').src = b.image || '';
}

document.getElementById('btn-play').addEventListener('click', startGame);
document.getElementById('btn-menu').addEventListener('click', () => {
  gameUI.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  gameState = 'menu';
});

// --- 3. Game Setup ---
function startGame() {
  gameState = 'playing';
  mainMenu.classList.add('hidden');
  gameUI.classList.remove('hidden');
  winScreen.classList.add('hidden');
  isGameOver = false;
  blueScore = 0; redScore = 0;
  gems = []; projectiles = []; bots = [];
  gemSpawnTimer = 0;

  resizeCanvas();
  setupPlayer();
  spawnBots();
  updateUI();
  
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoop();
}

function setupPlayer() {
  const conf = brawlersConfig[currentBrawlerIndex];
  player = {
    team: 'blue',
    x: canvasW * 0.2, y: canvasH * 0.5,
    maxHP: conf.baseHP + (conf.hpPerLevel * playerLevel),
    hp: conf.baseHP + (conf.hpPerLevel * playerLevel),
    speed: conf.speed,
    size: conf.size,
    damage: conf.baseDamage + (conf.damagePerLevel * playerLevel),
    attackConf: conf.attack,
    charges: conf.attack.maxCharges,
    maxCharges: conf.attack.maxCharges,
    reloadTimer: 0,
    gems: 0,
    frozen: 0,
    poison: { active: false, timer: 0, damage: 0, step: 0 }
  };
}

function spawnBots() {
  const conf = brawlersConfig[currentBrawlerIndex]; // Bots use same stats for simplicity
  for (let i = 0; i < 2; i++) {
    bots.push(createBot('blue', canvasW * 0.15, canvasH * (0.3 + i * 0.4)));
  }
  for (let i = 0; i < 3; i++) {
    bots.push(createBot('red', canvasW * 0.85, canvasH * (0.2 + i * 0.3)));
  }
}

function createBot(team, x, y) {
  const conf = brawlersConfig[0];
  return {
    team, x, y, spawnX: x, spawnY: y,
    maxHP: 3000, hp: 3000, speed: 2.8 + Math.random(), size: 20,
    damage: 350, attackConf: { ...conf.attack, speed: 6, range: 250 },
    charges: 3, maxCharges: 3, reloadTimer: 0,
    gems: 0, frozen: 0, poison: { active: false },
    dir: Math.random() * Math.PI * 2, dirTimer: 0,
    alive: true, respawnTimer: 0
  };
}

// --- 4. Game Loop ---
function resizeCanvas() {
  canvasW = window.innerWidth;
  canvasH = window.innerHeight;
  gameCanvas.width = canvasW;
  gameCanvas.height = canvasH;
}
window.addEventListener('resize', resizeCanvas);

function gameLoop() {
  if (gameState !== 'playing') return;
  const dt = 1/60;
  update(dt);
  draw();
  gameLoopId = requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (isGameOver) return;

  // Gem Spawn
  gemSpawnTimer += dt;
  if (gemSpawnTimer >= 5) {
    gemSpawnTimer = 0;
    gems.push({ x: canvasW/2, y: canvasH/2, picked: false });
  }

  // Player Movement & Joystick
  if (player.alive !== false && player.frozen <= 0) {
    player.x += moveJoy.dx * player.speed;
    player.y += moveJoy.dy * player.speed;
  }
  player.x = Math.max(player.size, Math.min(canvasW - player.size, player.x));
  player.y = Math.max(player.size, Math.min(canvasH - player.size, player.y));

  // Player Reload
  if (player.charges < player.maxCharges) {
    player.reloadTimer += dt;
    if (player.reloadTimer >= player.attackConf.reloadSpeed) {
      player.reloadTimer -= player.attackConf.reloadSpeed;
      player.charges++;
    }
  }

  // Player Attack
  if (attackJoy.active && player.charges > 0 && player.frozen <= 0) {
    const len = Math.hypot(attackJoy.dx, attackJoy.dy);
    if (len > 0.3) {
      spawnProjectile(player, attackJoy.dx/len, attackJoy.dy/len);
      player.charges--;
      attackJoy.active = false; // Tap to shoot
    }
  }

  // Player Status Effects
  if (player.frozen > 0) player.frozen -= dt;
  applyDoT(player, dt);

  // Bots Update
  bots.forEach(bot => {
    if (!bot.alive) {
      bot.respawnTimer += dt;
      if (bot.respawnTimer >= 3) {
        bot.alive = true; bot.hp = bot.maxHP; bot.x = bot.spawnX; bot.y = bot.spawnY; bot.respawnTimer = 0;
      }
      return;
    }

    if (bot.frozen <= 0) {
      bot.dirTimer -= dt;
      if (bot.dirTimer <= 0) { bot.dir = Math.random() * Math.PI * 2; bot.dirTimer = 1 + Math.random(); }
      bot.x += Math.cos(bot.dir) * bot.speed;
      bot.y += Math.sin(bot.dir) * bot.speed;
      bot.x = Math.max(bot.size, Math.min(canvasW - bot.size, bot.x));
      bot.y = Math.max(bot.size, Math.min(canvasH - bot.size, bot.y));

      // Bot Attack
      if (bot.charges < bot.maxCharges) { bot.reloadTimer += dt; if(bot.reloadTimer >= bot.attackConf.reloadSpeed){bot.reloadTimer=0;bot.charges++;}}
      if (Math.random() < 0.015 && bot.charges > 0) {
        const target = bot.team === 'blue' ? (Math.random() > 0.5 ? player : bots.find(b=>b.team==='red')) : (player || bots.find(b=>b.team==='blue'));
        if (target && target.alive) {
          const dx = target.x - bot.x, dy = target.y - bot.y;
          const dist = Math.hypot(dx, dy);
          if (dist < bot.attackConf.range) {
            spawnProjectile(bot, dx/dist, dy/dist);
            bot.charges--;
          }
        }
      }
    }
    if (bot.frozen > 0) bot.frozen -= dt;
    applyDoT(bot, dt);
  });

  // Projectiles Update
  projectiles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.life -= dt;
    if (p.life <= 0 || p.x < 0 || p.x > canvasW || p.y < 0 || p.y > canvasH) p.dead = true;

    // Collision
    const targets = p.team === 'blue' ? [player, ...bots.filter(b=>b.team==='red')] : [player, ...bots.filter(b=>b.team==='blue')];
    for (let t of targets) {
      if (!t.alive) continue;
      if (Math.hypot(p.x - t.x, p.y - t.y) < t.size + p.size) {
        t.hp -= p.damage;
        applyStatus(t, p.damageType, p.freezeDur, p.poisonDur);
        p.dead = true;
        break;
      }
    }
  });
  projectiles = projectiles.filter(p => !p.dead);

  // Gems Logic
  gems.forEach(g => {
    if (g.picked) return;
    const entities = [player, ...bots];
    for (let e of entities) {
      if (e.alive && Math.hypot(g.x - e.x, g.y - e.y) < e.size + 10) {
        g.picked = true;
        e.gems++;
        if (e.team === 'blue') blueScore++; else redScore++;
        if (blueScore >= 10) endGame('blue');
        if (redScore >= 10) endGame('red');
        break;
      }
    }
  });
  gems = gems.filter(g => !g.picked || g.dropped);

  // Check Deaths
  checkDeath(player, 'blue');
  bots.forEach(b => checkDeath(b, b.team));
}

function checkDeath(entity, team) {
  if (entity.hp <= 0 && entity.alive) {
    entity.alive = false; entity.respawnTimer = 0;
    if (team === 'blue') { blueScore -= entity.gems; blueScore = Math.max(0, blueScore); }
    else { redScore -= entity.gems; redScore = Math.max(0, redScore); }
    for(let i=0;i<entity.gems;i++) gems.push({ x: entity.x + (Math.random()-0.5)*20, y: entity.y + (Math.random()-0.5)*20, dropped: true, picked: false });
    entity.gems = 0;
  }
}

function applyStatus(target, type, freezeDur, poisonDur) {
  if (type === 'freeze') target.frozen = freezeDur;
  if (type === 'poison') {
    target.poison = { active: true, timer: poisonDur, damage: 50, step: 0 };
  }
}

function applyDoT(target, dt) {
  if (!target.poison.active) return;
  target.poison.step += dt;
  if (target.poison.step >= 0.5) {
    target.hp -= target.poison.damage;
    target.poison.damage = Math.max(10, target.poison.damage - 5);
    target.poison.step = 0;
  }
  target.poison.timer -= dt;
  if (target.poison.timer <= 0) target.poison.active = false;
}

function spawnProjectile(owner, dx, dy) {
  projectiles.push({
    x: owner.x, y: owner.y,
    vx: dx * owner.attackConf.speed, vy: dy * owner.attackConf.speed,
    size: owner.attackConf.size, damage: owner.damage, team: owner.team,
    life: owner.attackConf.range / owner.attackConf.speed,
    damageType: owner.attackConf.damageType,
    freezeDur: owner.attackConf.freezeDuration,
    poisonDur: owner.attackConf.poisonDuration,
    dead: false
  });
}

function endGame(winnerTeam) {
  isGameOver = true;
  winText.textContent = winnerTeam === 'blue' ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ';
  winText.style.color = winnerTeam === 'blue' ? '#4caf50' : '#f44336';
  winScreen.classList.remove('hidden');
}

// --- 5. Drawing ---
function draw() {
  ctx.clearRect(0, 0, canvasW, canvasH);
  // Grid
  ctx.strokeStyle = '#3a4a3a'; ctx.lineWidth = 1;
  for (let x=0; x<canvasW; x+=50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvasH); ctx.stroke(); }
  for (let y=0; y<canvasH; y+=50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasW,y); ctx.stroke(); }

  // Gems
  gems.forEach(g => {
    ctx.fillStyle = '#00ffff';
    ctx.beginPath(); ctx.arc(g.x, g.y, 8, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(g.x-5, g.y); ctx.lineTo(g.x+5, g.y); ctx.moveTo(g.x, g.y-5); ctx.lineTo(g.x, g.y+5); ctx.stroke();
  });

  // Projectiles
  projectiles.forEach(p => {
    ctx.fillStyle = p.team === 'blue' ? '#4d9eff' : '#ff4d4d';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
  });

  // Bots & Player
  const entities = [player, ...bots];
  entities.forEach(e => {
    if (!e.alive) return;
    ctx.fillStyle = e.team === 'blue' ? '#4d9eff' : '#ff4d4d';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill();
    
    // HP Bar
    ctx.fillStyle = '#333'; ctx.fillRect(e.x - 20, e.y - e.size - 15, 40, 6);
    ctx.fillStyle = e.hp/e.maxHP > 0.3 ? '#4caf50' : '#f44336';
    ctx.fillRect(e.x - 20, e.y - e.size - 15, 40 * (e.hp/e.maxHP), 6);

    // Gems count
    if (e.gems > 0) {
      ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`💎${e.gems}`, e.x, e.y - e.size - 20);
    }

    // Freeze effect
    if (e.frozen > 0) {
      ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.size + 5, 0, Math.PI*2); ctx.stroke();
    }
  });
}

// --- 6. UI & Input ---
function updateUI() {
  const hpPct = Math.max(0, (player.hp / player.maxHP) * 100);
  document.getElementById('hp-bar').style.width = `${hpPct}%`;
  
  const ammoCont = document.getElementById('ammo-container');
  ammoCont.innerHTML = '';
  for (let i=0; i<player.maxCharges; i++) {
    const pip = document.createElement('div');
    pip.className = `ammo-pip ${i >= player.charges ? 'empty' : ''}`;
    ammoCont.appendChild(pip);
  }
  document.getElementById('score-display').textContent = `
