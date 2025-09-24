// Galactic Rebellion - Protótipo simples com Phaser 3
// Salve como game.js na mesma pasta do index.html

const WIDTH = 900;
const HEIGHT = 600;

const config = {
  type: Phaser.AUTO,
  parent: 'gameContainer',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#0b0b12',
  physics: {
    default: 'arcade',
    arcade: { debug: false, gravity: { y: 0 } }
  },
  scene: {
    preload,
    create,
    update
  }
};

const game = new Phaser.Game(config);

let player, cursors, pointer;
let bullets, enemies, enemyBullets;
let lastFired = 0;
let hp = 100;
let score = 0;
let power = 100;
let hpText, scoreText, powerText;
let canMelee = true;
let meleeCooldown = 500; // ms
let pushCooldown = 3000;
let lastPush = 0;
let spawnTimer = 0;

function preload() {
  // No images: we'll use graphic shapes. But load simple audio (optional).
  this.load.audio('blaster', 'https://cdn.jsdelivr.net/gh/jshlbrt/short-audio-host@main/blaster-short.mp3'); // optional - may 404 safely
  this.load.audio('hit', 'https://cdn.jsdelivr.net/gh/jshlbrt/short-audio-host@main/hit-short.mp3');
}

function create() {
  // world bounds
  this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);

  // player: simple circle graphics turned into texture
  const g = this.add.graphics();
  g.fillStyle(0x44ddff, 1);
  g.fillCircle(0, 0, 20);
  g.generateTexture('playerCircle', 40, 40);
  g.clear();

  player = this.physics.add.sprite(WIDTH/2, HEIGHT/2, 'playerCircle');
  player.setCollideWorldBounds(true);
  player.speed = 200;

  // bullet group
  bullets = this.physics.add.group({
    classType: Phaser.GameObjects.Rectangle,
    runChildUpdate: true
  });

  // enemy bullets
  enemyBullets = this.physics.add.group();

  // enemies group
  enemies = this.physics.add.group();

  // collisions
  this.physics.add.overlap(bullets, enemies, onBulletHitEnemy, null, this);
  this.physics.add.overlap(enemyBullets, player, onPlayerHit, null, this);
  this.physics.add.overlap(enemies, player, onEnemyTouchPlayer, null, this);

  cursors = this.input.keyboard.createCursorKeys();
  this.keys = this.input.keyboard.addKeys('W,A,S,D,E,Q');

  pointer = this.input.activePointer;

  // HUD refs
  hpText = document.getElementById('hp');
  scoreText = document.getElementById('score');
  powerText = document.getElementById('power');
  updateHUD();

  // Shooting input
  this.input.on('pointerdown', (pointer) => {
    shoot.call(this);
  });

  // Melee (E)
  this.input.keyboard.on('keydown-E', () => {
    melee.call(this);
  });

  // Push power (Q)
  this.input.keyboard.on('keydown-Q', () => {
    pushPower.call(this);
  });

  // initial enemy
  spawnEnemy(this);

  // simple background stars
  createStars(this);
}

function update(time, delta) {
  // movement
  let vx = 0, vy = 0;
  if (this.keys.A.isDown || cursors.left.isDown) vx = -1;
  if (this.keys.D.isDown || cursors.right.isDown) vx = 1;
  if (this.keys.W.isDown || cursors.up.isDown) vy = -1;
  if (this.keys.S.isDown || cursors.down.isDown) vy = 1;

  const len = Math.hypot(vx, vy);
  if (len > 0) {
    vx /= len; vy /= len;
    player.setVelocity(vx * player.speed, vy * player.speed);
  } else {
    player.setVelocity(0, 0);
  }

  // rotate to pointer
  const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
  player.setRotation(angle);

  // enemies AI: move toward player, occasionally shoot
  enemies.getChildren().forEach(enemy => {
    if (!enemy.active) return;
    const angleToPlayer = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    this.physics.velocityFromRotation(angleToPlayer, enemy.speed, enemy.body.velocity);

    // shooting chance
    if (time > enemy.nextShot) {
      enemy.nextShot = time + Phaser.Math.Between(800, 1600);
      enemyShoot.call(this, enemy);
    }
  });

  // spawn logic
  spawnTimer += delta;
  if (spawnTimer > 2500) {
    spawnTimer = 0;
    spawnEnemy(this);
  }

  // lose condition
  if (hp <= 0) {
    this.scene.pause();
    const style = { font: "36px Arial", fill: "#ff0000" };
    const txt = this.add.text(WIDTH/2, HEIGHT/2 - 30, "GAME OVER", style).setOrigin(0.5);
    this.add.text(WIDTH/2, HEIGHT/2 + 20, `Pontos: ${score}`, { font: "20px Arial", fill: "#fff" }).setOrigin(0.5);
  }

  // small regen of power
  power = Math.min(100, power + delta * 0.01);
  updateHUD();
}

function shoot() {
  const now = this.time.now;
  if (now < lastFired + 180) return; // fire rate
  lastFired = now;

  const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
  const vx = Math.cos(angle) * 500;
  const vy = Math.sin(angle) * 500;

  const b = this.add.rectangle(player.x + Math.cos(angle)*30, player.y + Math.sin(angle)*30, 8, 4, 0xffdd55);
  this.physics.add.existing(b);
  b.body.setVelocity(vx, vy);
  b.body.setCollideWorldBounds(true);
  b.body.onWorldBounds = true;
  b.lifespan = 1200;
  bullets.add(b);

  // auto-destroy after lifespan
  this.time.delayedCall(b.lifespan, () => { if (b) b.destroy(); });

  // optional sound
  if (this.sound.get('blaster')) this.sound.play('blaster', { volume: 0.1 });
}

function onBulletHitEnemy(bullet, enemy) {
  if (!bullet.active || !enemy.active) return;
  bullet.destroy();
  enemy.hp -= 35;
  if (this.sound.get('hit')) this.sound.play('hit', { volume: 0.08 });

  if (enemy.hp <= 0) {
    enemy.destroy();
    score += 50;
    updateHUD();
  }
}

function spawnEnemy(scene) {
  // spawn at random edge
  const side = Phaser.Math.Between(0,3);
  let x=0,y=0;
  if (side === 0) { x = -20; y = Phaser.Math.Between(0, HEIGHT); }
  if (side === 1) { x = WIDTH+20; y = Phaser.Math.Between(0, HEIGHT); }
  if (side === 2) { x = Phaser.Math.Between(0, WIDTH); y = -20; }
  if (side === 3) { x = Phaser.Math.Between(0, WIDTH); y = HEIGHT+20; }

  // draw enemy as red triangle texture
  const g = scene.add.graphics();
  g.fillStyle(0xee5566, 1);
  g.fillTriangle(0, 24, 12, 0, 24, 24);
  g.generateTexture('enemyTri' + Date.now(), 24, 24);
  g.destroy();

  const e = scene.physics.add.sprite(x, y, g.texture.key);
  e.speed = Phaser.Math.Between(40, 90);
  e.hp = 80;
  e.nextShot = 0;

  enemies.add(e);
}

function enemyShoot(enemy) {
  if (!enemy.active) return;
  const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
  const vx = Math.cos(angle) * 220;
  const vy = Math.sin(angle) * 220;
  const b = this.add.circle(enemy.x + Math.cos(angle)*16, enemy.y + Math.sin(angle)*16, 5, 0xffaa33);
  this.physics.add.existing(b);
  b.body.setVelocity(vx, vy);
  enemyBullets.add(b);

  // destroy after time
  this.time.delayedCall(3000, () => { if (b) b.destroy(); });
}

function onPlayerHit(playerObj, bullet) {
  bullet.destroy();
  hp -= 12;
  updateHUD();
  if (hp <= 0) hp = 0;
}

function onEnemyTouchPlayer(playerObj, enemy) {
  // enemy touches player -> damage and push back
  hp -= 18;
  updateHUD();
  // small knockback
  const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
  player.setVelocity(Math.cos(angle)*180, Math.sin(angle)*180);
  // destroy enemy on contact
  if (enemy.active) enemy.destroy();
}

function melee() {
  const now = this.time.now;
  if (!canMelee) return;
  canMelee = false;
  setTimeout(() => canMelee = true, meleeCooldown);

  // melee hit: short range cone
  const range = 60;
  const angle = player.rotation;
  // damage nearby enemies
  enemies.getChildren().forEach(e => {
    const d = Phaser.Math.Distance.Between(player.x, player.y, e.x, e.y);
    if (d <= range) {
      const a = Phaser.Math.Angle.Between(player.x, player.y, e.x, e.y);
      const diff = Phaser.Math.Angle.Wrap(a - angle);
      if (Math.abs(diff) < Math.PI/3) {
        // in front cone
        e.hp -= 60;
        if (this.sound.get('hit')) this.sound.play('hit', { volume: 0.06 });
        if (e.hp <= 0) {
          e.destroy();
          score += 40;
          updateHUD();
        }
      }
    }
  });
}

function pushPower() {
  const now = this.time.now;
  if (now < lastPush + pushCooldown) return;
  if (power < 30) return; // cost
  lastPush = now;
  power -= 30;
  updateHUD();

  // push away enemies in radius
  const radius = 160;
  enemies.getChildren().forEach(e => {
    const d = Phaser.Math.Distance.Between(player.x, player.y, e.x, e.y);
    if (d <= radius) {
      const a = Phaser.Math.Angle.Between(player.x, player.y, e.x, e.y);
      const force = (radius - d) * 3;
      e.body.setVelocity(Math.cos(a)*force, Math.sin(a)*force);
      // small damage
      e.hp -= 30;
      if (e.hp <= 0) {
        e.destroy();
        score += 30;
        updateHUD();
      }
    }
  });

  // visual effect (circle)
  const scene = game.scene.scenes[0];
  const circ = scene.add.circle(player.x, player.y, radius, 0x88ddff, 0.12);
  scene.tweens.add({
    targets: circ,
    alpha: 0,
    scale: 0.6,
    duration: 600,
    onComplete: () => circ.destroy()
  });
}

function updateHUD() {
  hpText.innerText = `HP: ${Math.max(0, Math.round(hp))}`;
  scoreText.innerText = `Pontos: ${score}`;
  powerText.innerText = `Power: ${Math.round(power)}`;
}

// background stars
function createStars(scene) {
  const graphics = scene.add.graphics({ fillStyle: { color: 0xffffff }});
  for (let i=0;i<120;i++){
    const x = Phaser.Math.Between(0, WIDTH);
    const y = Phaser.Math.Between(0, HEIGHT);
    const r = Phaser.Math.Between(1,2);
    graphics.fillCircle(x,y,r);
  }
}
