class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.brawlersData = [];
        this.entities = [];
        this.crystals = [];
        this.bullets = [];
        this.gameState = 'loading';
        this.scores = { blue: 0, red: 0 };
        
        this.init();
    }

    async init() {
        // Имитация загрузки
        let p = 0;
        const interval = setInterval(() => {
            p += Math.random() * 10;
            if (p >= 100) {
                p = 100;
                clearInterval(interval);
                this.loadData();
            }
            document.getElementById('progress-fill').style.width = p + '%';
            document.getElementById('loading-text').innerText = `Загрузка ассетов... ${Math.floor(p)}%`;
        }, 100);
    }

    async loadData() {
        try {
            const res = await fetch('./data/brawlers.json');
            const data = await res.json();
            this.brawlersData = data.brawlers;
            this.showMenu();
        } catch (e) {
            console.error("Ошибка загрузки JSON. Запустите через сервер!", e);
            // Фолбек если нет сервера для теста
            this.brawlersData = [{ id: 'test', name: 'БОЕЦ', hp_base: 3200, hp_step: 160, speed: 3.5, damage_base: 1000, ammo_max: 3 }];
            this.showMenu();
        }
    }

    showMenu() {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
    }

    startBattle() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('battle-screen').style.display = 'block';
        
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.setupPlayers();
        this.gameState = 'playing';
        this.spawnLoop();
        this.gameLoop();
    }

    setupPlayers() {
        const config = this.brawlersData[0]; // Берем Шелли
        const level = 5;

        // Игрок (Синий)
        this.entities.push(new Entity(200, 300, 'blue', config, level, true));
        // Союзники
        this.entities.push(new Entity(200, 150, 'blue', config, level));
        this.entities.push(new Entity(200, 450, 'blue', config, level));
        // Враги (Красные)
        this.entities.push(new Entity(this.canvas.width - 200, 150, 'red', config, level));
        this.entities.push(new Entity(this.canvas.width - 200, 300, 'red', config, level));
        this.entities.push(new Entity(this.canvas.width - 200, 450, 'red', config, level));
    }

    spawnLoop() {
        setInterval(() => {
            if(this.gameState === 'playing') {
                this.crystals.push({
                    x: this.canvas.width/2 + (Math.random()*60 - 30),
                    y: this.canvas.height/2 + (Math.random()*60 - 30)
                });
            }
        }, 8000);
    }

    gameLoop() {
        if(this.gameState !== 'playing') return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        this.entities.forEach(ent => ent.update(this));
        this.bullets.forEach((b, i) => {
            b.x += b.vx; b.y += b.vy;
            if(b.x < 0 || b.x > this.canvas.width) this.bullets.splice(i, 1);
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Кристаллы
        this.crystals.forEach(c => {
            this.ctx.fillStyle = '#9b59b6';
            this.ctx.beginPath(); this.ctx.arc(c.x, c.y, 10, 0, Math.PI*2); this.ctx.fill();
        });

        this.entities.forEach(ent => ent.draw(this.ctx));
        
        this.bullets.forEach(b => {
            this.ctx.fillStyle = 'yellow';
            this.ctx.beginPath(); this.ctx.arc(b.x, b.y, 5, 0, Math.PI*2); this.ctx.fill();
        });
    }
}

class Entity {
    constructor(x, y, team, config, level, isPlayer = false) {
        this.x = x; this.y = y;
        this.team = team;
        this.isPlayer = isPlayer;
        this.config = config;
        
        // Расчет статов по уровню
        this.maxHp = config.hp_base + (config.hp_step * (level - 1));
        this.hp = this.maxHp;
        this.damage = config.damage_base + (config.damage_step * (level - 1));
        this.speed = config.speed;
        this.gems = 0;
        
        this.isFrozen = false;
        this.ammo = config.ammo_max;
    }

    update(game) {
        if (this.isFrozen) return;

        if (this.isPlayer) {
            // Тут будет управление WASD
        } else {
            // Простой ИИ: движение к центру
            let dx = game.canvas.width/2 - this.x;
            let dy = game.canvas.height/2 - this.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if(dist > 50) {
                this.x += (dx/dist) * this.speed;
                this.y += (dy/dist) * this.speed;
            }
        }

        // Логика подбора кристаллов
        game.crystals.forEach((c, i) => {
            if(Math.hypot(this.x - c.x, this.y - c.y) < 30) {
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
        ctx.beginPath();
        ctx.arc(this.x, this.y, 25, 0, Math.PI*2);
        ctx.fill();
        
        // ХП Бар
        ctx.fillStyle = 'black'; ctx.fillRect(this.x - 25, this.y - 40, 50, 5);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.x - 25, this.y - 40, (this.hp/this.maxHp)*50, 5);
        
        if(this.gems > 0) {
            ctx.fillStyle = 'white';
            ctx.fillText("💎 " + this.gems, this.x - 10, this.y - 50);
        }
    }
}

const game = new GameEngine();
