class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.brawlersData = [];
        this.entities = [];
        this.bullets = [];
        this.crystals = [];
        this.scores = { blue: 0, red: 0 };
        this.inputs = { move: {x:0, y:0}, attack: {x:0, y:0, active: false} };
        
        this.init();
    }

    async init() {
        // Симуляция прогресса загрузки
        let progress = 0;
        const loader = setInterval(() => {
            progress += 2;
            document.getElementById('progress-fill').style.width = progress + '%';
            document.getElementById('loading-text').innerText = `Загрузка... ${progress}%`;
            if (progress >= 100) { clearInterval(loader); this.setupMenu(); }
        }, 30);
    }

    setupMenu() {
        // В продакшене тут fetch('./data/brawlers.json')
        // Для примера используем встроенный конфиг (Шелли)
        this.brawlersData = [{
            id: 'shelly', name: 'ШЕЛЛИ', hp_base: 3200, hp_step: 160, speed: 3.8,
            ammo_max: 3, reload_time: 1500,
            attack: { damage_base: 1000, damage_step: 100, range: 350, effect: 'normal' }
        }];

        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
        this.initJoysticks();
    }

    initJoysticks() {
        const setup = (zoneId, stickId, isAttack) => {
            const zone = document.getElementById(zoneId);
            const stick = document.getElementById(stickId);
            let active = false;

            const move = (e) => {
                if (!active) return;
                const touch = e.touches ? e.touches[0] : e;
                const rect = zone.getBoundingClientRect();
                const center = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
                let dx = touch.clientX - center.x;
                let dy = touch.clientY - center.y;
                const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 50);
                const angle = Math.atan2(dy, dx);
                
                const valX = Math.cos(angle) * (dist/50);
                const valY = Math.sin(angle) * (dist/50);
                stick.style.transform = `translate(${valX*30}px, ${valY*30}px)`;
                
                if (isAttack) {
                    this.inputs.attack = { x: valX, y: valY, active: true };
                } else {
                    this.inputs.move = { x: valX, y: valY };
                }
            };

            zone.onmousedown = (e) => { active = true; move(e); };
            window.addEventListener('mouseup', () => { 
                if (isAttack && this.inputs.attack.active) this.playerShoot();
                active = false; 
                stick.style.transform = 'translate(0,0)'; 
                if (isAttack) this.inputs.attack.active = false; else this.inputs.move = {x:0, y:0};
            });
            zone.ontouchstart = (e) => { active = true; move(e); };
            window.addEventListener('mousemove', move);
            window.addEventListener('touchmove', move);
        };

        setup('move-zone', 'move-stick', false);
        setup('attack-zone', 'attack-stick', true);
    }

    startBattle() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('battle-screen').style.display = 'block';
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        const config = this.brawlersData[0]; // Шелли
        // Наша команда (Синие)
        this.entities.push(new Entity(150, 300, 'blue', config, 5, true)); // Игрок 5 лвл
        this.entities.push(new Entity(150, 150, 'blue', config, 3));
        this.entities.push(new Entity(150, 450, 'blue', config, 3));
        // Враги (Красные)
        this.entities.push(new Entity(this.canvas.width-150, 150, 'red', config, 3));
        this.entities.push(new Entity(this.canvas.width-150, 300, 'red', config, 3));
        this.entities.push(new Entity(this.canvas.width-150, 450, 'red', config, 3));

        setInterval(() => this.spawnCrystal(), 8000);
        this.gameLoop();
    }

    spawnCrystal() {
        this.crystals.push({ x: this.canvas.width/2, y: this.canvas.height/2 });
    }

    playerShoot() {
        const p = this.entities.find(e => e.isPlayer);
        if (p && p.ammo >= 1) {
            const angle = Math.atan2(this.inputs.attack.y, this.inputs.attack.x);
            this.fire(p, angle);
            p.ammo--;
        }
    }

    fire(owner, angle) {
        this.bullets.push({
            x: owner.x, y: owner.y,
            vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12,
            damage: owner.damage, team: owner.team,
            range: owner.config.attack.range, traveled: 0,
            effect: owner.config.attack.effect
        });
    }

    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        this.entities.forEach(ent => ent.update(this));
        
        this.bullets.forEach((b, i) => {
            b.x += b.vx; b.y += b.vy; b.traveled += 12;
            if (b.traveled > b.range) return this.bullets.splice(i, 1);

            this.entities.forEach(target => {
                if (target.team !== b.team && Math.hypot(target.x - b.x, target.y - b.y) < 30) {
                    target.takeDamage(b.damage, b.effect);
                    this.bullets.splice(i, 1);
                }
            });
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Центр
        this.ctx.fillStyle = 'rgba(204, 0, 255, 0.2)';
        this.ctx.beginPath(); this.ctx.arc(this.canvas.width/2, this.canvas.height/2, 50, 0, Math.PI*2); this.ctx.fill();
        
        this.crystals.forEach(c => {
            this.ctx.fillStyle = '#cc00ff';
            this.ctx.beginPath(); this.ctx.arc(c.x, c.y, 12, 0, Math.PI*2); this.ctx.fill();
        });

        this.entities.forEach(e => e.draw(this.ctx));
        this.bullets.forEach(b => {
            this.ctx.fillStyle = '#f1c40f';
            this.ctx.beginPath(); this.ctx.arc(b.x, b.y, 7, 0, Math.PI*2); this.ctx.fill();
        });
    }
}

class Entity {
    constructor(x, y, team, config, level, isPlayer = false) {
        this.x = x; this.y = y; this.team = team; this.config = config; this.isPlayer = isPlayer;
        this.maxHp = config.hp_base + (config.hp_step * (level - 1));
        this.hp = this.maxHp;
        this.damage = config.attack.damage_base + (config.attack.damage_step * (level - 1));
        this.ammo = config.ammo_max;
        this.gems = 0;
        this.isFrozen = false;
        this.poisonTicks = 0;
        this.lastAi = 0;
        this.target = {x: x, y: y};
    }

    takeDamage(amt, effect) {
        this.hp -= amt;
        if (effect === 'freeze') {
            this.isFrozen = true;
            setTimeout(() => this.isFrozen = false, 2000);
        }
        if (effect === 'poison') this.poisonTicks = 4;
    }

    update(game) {
        if (this.hp <= 0) {
            // Drop Gems
            for(let i=0; i<this.gems; i++) game.crystals.push({x: this.x + Math.random()*60-30, y: this.y + Math.random()*60-30});
            if (this.team === 'blue') game.scores.blue -= this.gems; else game.scores.red -= this.gems;
            this.gems = 0; this.hp = this.maxHp; this.x = this.team === 'blue' ? 100 : game.canvas.width-100;
            return;
        }

        if (this.isFrozen) return;

        // Яд
        if (this.poisonTicks > 0) {
            this.hp -= 100; // Урон от яда
            this.poisonTicks -= 0.01;
        }

        if (this.isPlayer) {
            this.x += game.inputs.move.x * this.config.speed;
            this.y += game.inputs.move.y * this.config.speed;
        } else {
            // ИИ ботов
            if (Date.now() - this.lastAi > 3000) {
                this.target = { x: Math.random()*game.canvas.width, y: Math.random()*game.canvas.height };
                this.lastAi = Date.now();
                // Бот стреляет в игрока
                const p = game.entities[0];
                game.fire(this, Math.atan2(p.y - this.y, p.x - this.x));
            }
            let dx = this.target.x - this.x;
            let dy = this.target.y - this.y;
            let d = Math.hypot(dx, dy);
            if (d > 20) { this.x += (dx/d)*2; this.y += (dy/d)*2; }
        }

        // Подбор кристаллов
        game.crystals.forEach((c, i) => {
            if (Math.hypot(this.x - c.x, this.y - c.y) < 40) {
                game.crystals.splice(i, 1);
                this.gems++;
                if(this.team === 'blue') game.scores.blue++; else game.scores.red++;
                document.getElementById('blue-gems').innerText = game.scores.blue;
                document.getElementById('red-gems').innerText = game.scores.red;
            }
        });
    }

    draw(ctx) {
        ctx.fillStyle = this.team === 'blue' ? '#3498db' : '#e74c3c';
        if (this.isFrozen) ctx.fillStyle = '#81ecec';
        ctx.beginPath(); ctx.arc(this.x, this.y, 25, 0, Math.PI*2); ctx.fill();
        if (this.isPlayer) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); }
        
        // HP Bar
        ctx.fillStyle = '#000'; ctx.fillRect(this.x-30, this.y-45, 60, 8);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.x-30, this.y-45, (this.hp/this.maxHp)*60, 8);
        
        if (this.gems > 0) {
            ctx.fillStyle = '#fff'; ctx.fillText("💎 " + this.gems, this.x - 15, this.y - 55);
        }
    }
}

const game = new Game();
function startBattle() { game.startBattle(); }
