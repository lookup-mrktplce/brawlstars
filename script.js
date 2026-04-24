document.addEventListener('DOMContentLoaded', () => {
  // --- КОНФИГУРАЦИЯ ---
  const DEFAULT_BRAWLER = {
    id: "shelly", name: "Shelly", rarity: "Trophy Road", description: "Стартовый боец",
    baseHP: 3600, hpPerLevel: 300, baseDamage: 220, damagePerLevel: 25, // 📉 Урон снижен
    speed: 3.2, size: 22, image: "data/shelly.png",
    attack: {
      name: "Buckshot", speed: 7, size: 8, range: 260, shape: "projectile", type: "aimed",
      maxCharges: 3, reloadSpeed: 1.3, damageType: "normal", freezeDuration: 0, poisonDuration: 0
    }
  };

  let brawlersConfig = [DEFAULT_BRAWLER];
  let playerLevel = 0;
  let currentBrawlerIndex = 0;
  let gameState = 'loading';

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

  // --- ЗАГРУЗКА ---
  let progress = 0;
  const loadInterval = setInterval(() => {
    progress += Math.random() * 12 + 5;
    if (progress >= 100) progress = 100;
    loadingBar.style.width = `${progress}%`;
    loadingText.textContent = `Загрузка: ${Math.floor(progress)}%`;
    
    if (progress === 100) {
      clearInterval(loadInterval);
      loadingText.textContent = 'Готово!';
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        mainMenu.classList.remove('hidden');
        gameState = 'menu';
        updateMenuUI();
      }, 250);
    }
  }, 80);

  // Загрузчик JSON с принудительным отключением кэша и проверкой ключей
  fetch('data/brawlers.json?v=' + Date.now(), { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      if (data.brawlers && data.brawlers.length > 0) {
        brawlersConfig = data.brawlers;
        console.log('✅ Боец из JSON:', data.brawlers[0].name);
        console.log(`❤️ HP: ${data.brawlers[0].baseHP} | ⚔️ DMG: ${data.brawlers[0].baseDamage}`);
      } else {
        console.warn('⚠️ Массив "brawlers" пуст или отсутствует в JSON');
      }
    })
    .catch(e => console.error('❌ Ошибка загрузки JSON:', e));

  // --- МЕНЮ ---
  function updateMenuUI() {
    const b = brawlersConfig[currentBrawlerIndex] || DEFAULT_BRAWLER;
    document.getElementById('brawler-name').textContent = b.name;
    document.getElementById('brawler-level').textContent = `Уровень: ${playerLevel}`;
    document.getElementById('menu-brawler-img').src = b.image || '';
  }
  document.getElementById('btn-play').addEventListener('click', startGame);
  document.getElementById('btn-menu').addEventListener('click', () => {
    gameUI.classList.add('hidden'); mainMenu.classList.remove('hidden');
    gameState = 'menu'; cancelAnimationFrame(gameLoopId);
  });

  // --- ИГРОВАЯ ЛОГИКА ---
  let canvasW, canvasH;
  const MAP_MARGIN = 50; // 🗺️ Отступ для карты (делает её меньше)
  let map = { x: 0, y: 0, w: 0, h: 0 };
  
  let player, bots = [], projectiles = [], gems = [];
  let blueScore = 0, redScore = 0;
  let gameLoopId, gemSpawnTimer = 0, isGameOver = false;
  const moveJoy = { active: false, dx: 0, dy: 0, id: null };
  const attackJoy = { active: false, dx: 0, dy: 0, id: null, fired: false };

  function startGame() {
    gameState = 'playing'; mainMenu.classList.add('hidden'); gameUI.classList.remove('hidden');
    winScreen.classList.add('hidden'); isGameOver = false;
    blueScore = 0; redScore = 0; gems = []; projectiles = []; bots = []; gemSpawnTimer = 0;
    resizeCanvas(); setupPlayer(); spawnBots(); initAmmoUI(player.maxCharges);
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoop();
  }

  function resizeCanvas() {
    canvasW = window.innerWidth; canvasH = window.innerHeight;
    gameCanvas.width = canvasW; gameCanvas.height = canvasH;
    map.x = MAP_MARGIN; map.y = MAP_MARGIN;
    map.w = canvasW - MAP_MARGIN * 2; map.h = canvasH - MAP_MARGIN * 2;
  }
  window.addEventListener('resize', resizeCanvas);

  function clampToMap(pos, size) {
    return Math.max(map.x + size, Math.min(map.x + map.w - size, pos));
  }

  function setupPlayer() {
    const conf = brawlersConfig[currentBrawlerIndex] || DEFAULT_BRAWLER;
    player = {
      team: 'blue', x: map.x + map.w * 0.2, y: map.y + map.h * 0.5,
      maxHP: conf.baseHP + (conf.hpPerLevel * playerLevel),
      hp: conf.baseHP + (conf.hpPerLevel * playerLevel),
      speed: conf.speed, size: conf.size,
      damage: conf.baseDamage + (conf.damagePerLevel * playerLevel),
      attackConf: conf.attack, charges: conf.attack.maxCharges, maxCharges: conf.attack.maxCharges,
      reloadTimer: 0, gems: 0, frozen: 0, poison: { active: false, timer: 0, damage: 0, step: 0 },
      alive: true, respawnTimer: 0
    };
  }

  function spawnBots() {
    for (let i = 0; i < 2; i++) bots.push(createBot('blue', map.x + map.w * 0.2, map.y + map.h * (0.3 + i * 0.4)));
    for (let i = 0; i < 3; i++) bots.push(createBot('red', map.x + map.w * 0.8, map.y + map.h * (0.2 + i * 0.3)));
  }

  function createBot(team, x, y) {
    const conf = brawlersConfig[0] || DEFAULT_BRAWLER;
    return {
      team, x, y, spawnX: x, spawnY: y,
      maxHP: 3000, hp: 3000, 
      speed: 1.2 + Math.random() * 0.4, 
      size: 20, damage: 220, // 📉 Урон ботов снижен
      attackConf: { ...conf.attack, speed: 6, range: 120, maxCharges: 3, reloadSpeed: 1.7 },
      charges: 3, maxCharges: 3, reloadTimer: 0,
      gems: 0, frozen: 0, poison: { active: false },
      dir: Math.random() * Math.PI * 2, dirTimer: 0,
      alive: true, respawnTimer: 0,
      attackCooldown: 1.6
    };
  }

  function gameLoop() {
    if (gameState !== 'playing') return;
    const dt = 1/60; update(dt); draw(); gameLoopId = requestAnimationFrame(gameLoop);
  }

  function update(dt) {
    if (isGameOver) return;

    gemSpawnTimer += dt;
    if (gemSpawnTimer >= 5) { 
      gemSpawnTimer = 0; 
      gems.push({ x: map.x + map.w/2, y: map.y + map.h/2, picked: false }); 
    }

    // Игрок
    if (player.alive && player.frozen <= 0) {
      player.x += moveJoy.dx * player.speed; 
      player.y += moveJoy.dy * player.speed;
    }
    player.x = clampToMap(player.x, player.size);
    player.y = clampToMap(player.y, player.size);

    if (!player.alive) {
      player.respawnTimer += dt;
      if (player.respawnTimer >= 3) {
        player.alive = true; player.hp = player.maxHP;
        player.x = map.x + map.w * 0.2; player.y = map.y + map.h * 0.5;
        player.respawnTimer = 0; player.gems = 0;
      }
    } else {
      if (player.charges < player.maxCharges) {
        player.reloadTimer += dt;
        if (player.reloadTimer >= player.attackConf.reloadSpeed) { player.reloadTimer -= player.attackConf.reloadSpeed; player.charges++; }
      }
      // 🚫 СТРОГАЯ ПРОВЕРКА: если 0 зарядов → атака блокируется полностью
      const attackLen = Math.hypot(attackJoy.dx, attackJoy.dy);
      if (player.charges > 0 && attackJoy.active && !attackJoy.fired && attackLen > 0.4 && player.frozen <= 0) {
        spawnProjectile(player, attackJoy.dx/attackLen, attackJoy.dy/attackLen);
        player.charges--;
        attackJoy.fired = true;
      }
      if (player.frozen > 0) player.frozen -= dt;
      applyDoT(player, dt);
    }

    // Боты
    bots.forEach(bot => {
      if (!bot.alive) { bot.respawnTimer += dt; if (bot.respawnTimer >= 3) { bot.alive = true; bot.hp = bot.maxHP; bot.x = bot.spawnX; bot.y = bot.spawnY; bot.respawnTimer = 0; } return; }
      if (bot.frozen <= 0) {
        bot.dirTimer -= dt;
        if (bot.dirTimer <= 0) { bot.dir = Math.random() * Math.PI * 2; bot.dirTimer = 1 + Math.random(); }
        bot.x += Math.cos(bot.dir) * bot.speed; bot.y += Math.sin(bot.dir) * bot.speed;
        bot.x = clampToMap(bot.x, bot.size);
        bot.y = clampToMap(bot.y, bot.size);

        if (bot.charges < bot.maxCharges) { bot.reloadTimer += dt; if(bot.reloadTimer >= bot.attackConf.reloadSpeed){bot.reloadTimer=0;bot.charges++;}}
        
        bot.attackCooldown -= dt;
        if (bot.attackCooldown <= 0 && bot.charges > 0) {
          const angle = Math.random() * Math.PI * 2;
          spawnProjectile(bot, Math.cos(angle), Math.sin(angle));
          bot.charges--;
          bot.attackCooldown = 1.5 + Math.random() * 0.7;
        }
      }
      if (bot.frozen > 0) bot.frozen -= dt;
      applyDoT(bot, dt);
    });

    // Снаряды
    projectiles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life -= dt;
      if (p.life <= 0 || p.x < map.x || p.x > map.x + map.w || p.y < map.y || p.y > map.y + map.h) p.dead = true;

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

    // Кристаллы
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
    updateUI();
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
    if (type === 'poison') target.poison = { active: true, timer: poisonDur, damage: 50, step: 0 };
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
      poisonDur: owner.attackConf.poisonDuration || 0, dead: false
    });
  }
  function endGame(winnerTeam) {
    isGameOver = true; winText.textContent = winnerTeam === 'blue' ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ';
    winText.style.color = winnerTeam === 'blue' ? '#4caf50' : '#f44336';
    winScreen.classList.remove('hidden');
  }

  // --- ОТРИСОВКА ---
  function draw() {
    // 🎨 Бежевый фон
    ctx.fillStyle = '#e8e4d9';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 🗺️ Границы карты
    ctx.fillStyle = '#d4c9b5';
    ctx.fillRect(0, 0, canvasW, map.y);
    ctx.fillRect(0, map.y + map.h, canvasW, canvasH - (map.y + map.h));
    ctx.fillRect(0, map.y, map.x, map.h);
    ctx.fillRect(map.x + map.w, map.y, canvasW - (map.x + map.w), map.h);

    // Сетка внутри карты
    ctx.strokeStyle = '#cbbfae'; ctx.lineWidth = 1;
    for (let x = map.x; x <= map.x + map.w; x += 50) { ctx.beginPath(); ctx.moveTo(x, map.y); ctx.lineTo(x, map.y + map.h); ctx.stroke(); }
    for (let y = map.y; y <= map.y + map.h; y += 50) { ctx.beginPath(); ctx.moveTo(map.x, y); ctx.lineTo(map.x + map.w, y); ctx.stroke(); }

    // Центральная линия
    ctx.strokeStyle = '#b0a591'; ctx.lineWidth = 3; ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(map.x + map.w/2, map.y); ctx.lineTo(map.x + map.w/2, map.y + map.h); ctx.stroke();
    ctx.setLineDash([]);

    gems.forEach(g => {
      ctx.fillStyle = '#00e5ff'; ctx.beginPath(); ctx.arc(g.x, g.y, 10, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(g.x-4, g.y); ctx.lineTo(g.x+4, g.y); ctx.moveTo(g.x, g.y-4); ctx.lineTo(g.x, g.y+4); ctx.stroke();
    });

    projectiles.forEach(p => {
      ctx.fillStyle = p.team === 'blue' ? '#3a8dff' : '#ff3a3a';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
    });

    const entities = [player, ...bots];
    entities.forEach(e => {
      if (!e.alive) return;
      ctx.fillStyle = e.team === 'blue' ? '#3a8dff' : '#ff3a3a';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();

      const barW = 40, barH = 6, barX = e.x - barW/2, barY = e.y - e.size - 16;
      ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = e.hp/e.maxHP > 0.3 ? '#4caf50' : '#f44336';
      ctx.fillRect(barX, barY, barW * Math.max(0, e.hp/e.maxHP), barH);

      ctx.fillStyle = '#111'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(e.hp), e.x, barY - 4);

      if (e.gems > 0) { ctx.fillStyle = '#111'; ctx.font = '13px sans-serif'; ctx.fillText(`💎${e.gems}`, e.x, barY - 18); }
      if (e.frozen > 0) { ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, e.size + 6, 0, Math.PI*2); ctx.stroke(); }
    });
  }

  // --- UI & УПРАВЛЕНИЕ ---
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
    const hpPct = Math.max(0, (player.hp / player.maxHP) * 100);
    document.getElementById('hp-bar').style.width = `${hpPct}%`;
    if (ammoPips.length !== player.maxCharges) initAmmoUI(player.maxCharges);
    ammoPips.forEach((pip, i) => { pip.className = `ammo-pip ${i >= player.charges ? 'empty' : ''}`; });
    document.getElementById('score-display').textContent = `🔵 Синие: ${blueScore} | 🔴 Красные: ${redScore}`;
  }

  function setupJoystick(el, joyState) {
    let startX, startY; const maxDist = 35;
    el.addEventListener('pointerdown', e => {
      joyState.id = e.pointerId; joyState.active = true; joyState.fired = false;
      startX = e.clientX; startY = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.querySelector('.knob').style.transform = `translate(0px, 0px)`;
      el.style.opacity = '1';
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== joyState.id) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, maxDist);
      const angle = Math.atan2(dy, dx);
      joyState.dx = Math.cos(angle) * (clamped / maxDist);
      joyState.dy = Math.sin(angle) * (clamped / maxDist);
      el.querySelector('.knob').style.transform = `translate(${joyState.dx * 35}px, ${joyState.dy * 35}px)`;
    });
    el.addEventListener('pointerup pointercancel', e => {
      if (e.pointerId !== joyState.id) return;
      joyState.active = false; joyState.dx = 0; joyState.dy = 0; joyState.id = null; joyState.fired = false;
      el.querySelector('.knob').style.transform = `translate(0,0)`;
      el.releasePointerCapture(e.pointerId);
    });
  }
  setupJoystick(document.getElementById('move-joystick'), moveJoy);
  setupJoystick(document.getElementById('attack-joystick'), attackJoy);
});
