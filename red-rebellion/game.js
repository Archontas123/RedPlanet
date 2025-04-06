import { Vector2, lineIntersectsRect, isLineOfSightClear } from './utils.js';
import { Player, Projectile, Item, ItemDrop, Container, MedKit, Generator } from './entities.js';
import { Settlement } from './settlement.js';
import { Door } from './structures.js';
import { WorldManager, CHUNK_SIZE, LOAD_RADIUS } from './world.js';

class Game {
    constructor() {
        this.startButton = document.getElementById('start-button');
        this.retryButton = document.getElementById('retry-button');
        this.menuScreen = document.getElementById('menu-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
        this.healthFill = document.getElementById('health-fill');
        this.plasmaScoreDisplay = document.getElementById('plasma-score');
        this.finalPlasmaScoreDisplay = document.getElementById('final-plasma-score');
        this.weaponDisplay = document.getElementById('weapon-display');
        this.rollIndicator = document.getElementById('roll-indicator');
        this.inventoryScreen = document.getElementById('inventory-screen');
        this.inventoryGrid = document.getElementById('inventory-grid');
        this.closeInventoryButton = document.getElementById('close-inventory-button');

        this.gameActive = false;
        this.lastTime = 0;
        this.player = null;
        this.worldManager = null;
        this.projectiles = [];
        this.items = [];
        this.itemDrops = [];
        this.plasmaScore = 0;
        this.inventoryOpen = false;
        this.camera = { x: 0, y: 0 };
        this.mousePos = { x: 0, y: 0 };

        this.keys = { w: false, a: false, s: false, d: false, shift: false, e: false, space: false, f: false, v: false, p: false };

        this.itemImagePaths = {
            rock: 'assets/items/rock.png',
            wood: 'assets/items/wood.png',
            heal: 'assets/items/heal.png',
            plasma: 'assets/items/plasma.png'
        };
        this.groundTile = new Image();
        this.groundTile.src = 'assets/ground/ground_tile_standard.png';
        this.groundPattern = null;

        this.playerImgStandard = new Image();
        this.playerImgStandard.src = 'assets/player/standard_player.png';
        this.playerImgIdle2 = new Image();
        this.playerImgIdle2.src = 'assets/player/idle_down_2.png';

        this.setupEventListeners();
        this.loadAssets();
    }

    loadAssets() {
        this.groundTile.onload = () => {
            if (this.ctx) {
                this.groundPattern = this.ctx.createPattern(this.groundTile, 'repeat');
            }
        };
        this.groundTile.onerror = () => console.error("Failed to load ground tile image.");
        this.playerImgStandard.onerror = () => console.error("Failed to load standard_player image.");
        this.playerImgIdle2.onerror = () => console.error("Failed to load idle_down_2 image.");
    }

    setupEventListeners() {
        this.startButton.addEventListener('click', () => this.startGame());
        this.retryButton.addEventListener('click', () => this.startGame());
        this.closeInventoryButton.addEventListener('click', () => this.toggleInventory());

        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('resize', () => this.handleResize());
    }

    handleKeyDown(e) {
        const key = e.key.toLowerCase();
        if (this.gameActive && this.player) {
            if (key === 'v') {
                this.toggleInventory();
                this.keys.v = true;
                e.preventDefault();
            } else if (!this.inventoryOpen) {
                if (e.key === ' ') {
                    this.keys.space = true;
                } else if (key === this.player.interactKey) {
                    this.keys[key] = true;
                    this.handleInteraction();
                } else if (key === this.player.pickupKey) {
                    this.keys[key] = true;
                    this.handlePickup();
                } else if (key in this.keys) {
                    this.keys[key] = true;
                }
            }
        }
    }

    handleKeyUp(e) {
        const key = e.key.toLowerCase();
        if (this.gameActive && this.player) {
            if (key === 'v') {
                this.keys.v = false;
            } else if (!this.inventoryOpen) {
                if (e.key === ' ') {
                    this.keys.space = false;
                } else if (key === this.player.interactKey) {
                     this.keys[key] = false;
                } else if (key === this.player.pickupKey) {
                     this.keys[key] = false;
                } else if (key in this.keys) {
                    this.keys[key] = false;
                }
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mousePos.x = e.clientX - rect.left;
        this.mousePos.y = e.clientY - rect.top;
    }

    handleMouseDown(e) {
        if (e.button === 0 && !this.inventoryOpen) {
            if (this.gameActive && this.player && this.worldManager) {
                 this.player.attack(this.mousePos, this.camera, this.projectiles, this.worldManager.getActiveSettlements());
            }
        }
    }

    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    initGame() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        if (this.minimapCanvas) {
            this.minimapCanvas.width = 150;
            this.minimapCanvas.height = 150;
        }

        this.worldManager = new WorldManager((amount) => this.updateScore(amount));

        const startPos = new Vector2(CHUNK_SIZE / 2, CHUNK_SIZE / 2);

        this.player = new Player(
            startPos,
            this.playerImgStandard,
            this.playerImgIdle2
        );

        this.projectiles = [];
        this.items = [];
        this.itemDrops = [];
        this.plasmaScore = 0;
        this.updateScoreDisplay();

        this.worldManager.updateActiveChunks(this.player.position.x, this.player.position.y);

        const startChunk = this.worldManager.getChunk(
            Math.floor(startPos.x / CHUNK_SIZE),
            Math.floor(startPos.y / CHUNK_SIZE)
        );
        console.log("Initial chunk:", startChunk);

        this.gameActive = true;
        this.lastTime = performance.now();
        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    updateScore(amount) {
        this.plasmaScore += amount;
        this.updateScoreDisplay();
    }

    updateScoreDisplay() {
        this.plasmaScoreDisplay.textContent = `Plasma: ${this.plasmaScore}`;
    }

    gameLoop(timestamp) {
        if (!this.gameActive) return;

        const deltaTime = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        const activeSettlements = this.worldManager.getActiveSettlements();

        if (!this.inventoryOpen) {
            this.worldManager.updateActiveChunks(this.player.position.x, this.player.position.y);

            this.player.update(deltaTime, this.keys, this.worldManager, this.healthFill, this.weaponDisplay, this.projectiles, this.itemDrops, this);

            activeSettlements.forEach(settlement => settlement.update(deltaTime, this.player, isLineOfSightClear, this.projectiles, this));

            this.projectiles.forEach(p => p.update(deltaTime, this.worldManager, this.player, () => this.gameOver()));
            this.projectiles = this.projectiles.filter(p => p.lifeTime > 0);

            this.items.forEach(item => item.update(deltaTime));
            this.itemDrops.forEach(drop => drop.update(deltaTime));
            this.itemDrops = this.itemDrops.filter(drop => drop.lifeTime > 0);

            for (let i = this.items.length - 1; i >= 0; i--) {
                 const item = this.items[i];
                 if (item.isInteractable && this.player.position.distance(item.position) < this.player.size.x / 2 + item.pickupRadius) {
                     if (item.itemType === 'Plasma') {
                         this.updateScore(item.quantity);
                         console.log(`Picked up ${item.quantity} Plasma (pre-placed).`);
                         this.items.splice(i, 1);
                     }
                 }
             }

            this.updateCamera();
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground(this.ctx, this.camera);

        const isPlayerInside = !!this.player.currentBuilding;

        activeSettlements.forEach(settlement => {
            settlement.buildings.forEach(building => {
                const drawFloor = isPlayerInside && this.player.currentBuilding === building ? this.player.currentFloor : 0;
                const drawInterior = isPlayerInside && this.player.currentBuilding === building;
                building.draw(this.ctx, this.camera, drawFloor, drawInterior);
            });

            settlement.humans.forEach(human => {
                const sameFloor = isPlayerInside && this.player.currentBuilding === human.building && this.player.currentFloor === human.currentFloor;
                const bothOutside = !isPlayerInside && !human.building;
                if (sameFloor || bothOutside) {
                    human.draw(this.ctx, this.camera);
                }
            });
        });

        this.items.forEach(item => {
            if (!isPlayerInside) {
                 item.draw(this.ctx, this.camera);
            }
        });

        this.itemDrops.forEach(drop => {
            const sameFloor = (!isPlayerInside && drop.floorIndex === 0) ||
                              (isPlayerInside && drop.floorIndex === this.player.currentFloor);
            if (sameFloor) {
                drop.draw(this.ctx, this.camera);
            }
        });

        this.projectiles.forEach(p => p.draw(this.ctx, this.camera));

        this.player.draw(this.ctx, this.camera);

        this.updateHUD();
        this.drawMinimap();

        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    updateCamera() {
        this.camera.x = this.player.position.x - this.canvas.width / 2;
        this.camera.y = this.player.position.y - this.canvas.height / 2;
    }

    drawBackground(ctx, camera) {
        if (this.groundPattern) {
            ctx.save();
            ctx.fillStyle = this.groundPattern;
            ctx.translate(-camera.x % this.groundTile.width, -camera.y % this.groundTile.height);
            ctx.fillRect(
                (camera.x % this.groundTile.width) - this.groundTile.width,
                (camera.y % this.groundTile.height) - this.groundTile.height,
                this.canvas.width + this.groundTile.width * 2,
                this.canvas.height + this.groundTile.height * 2
            );
            ctx.restore();
        } else {
            ctx.fillStyle = '#4d1a00';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        ctx.fillStyle = 'rgba(255, 255, 200, 0.6)';
        const starsPerChunk = 10;
        const { chunkX: centerChunkX, chunkY: centerChunkY } = this.worldManager.getChunkCoords(camera.x + this.canvas.width / 2, camera.y + this.canvas.height / 2);
        const renderRadius = 2;

        for (let dx = -renderRadius; dx <= renderRadius; dx++) {
            for (let dy = -renderRadius; dy <= renderRadius; dy++) {
                const chunkX = centerChunkX + dx;
                const chunkY = centerChunkY + dy;
                const chunkWorldX = chunkX * CHUNK_SIZE;
                const chunkWorldY = chunkY * CHUNK_SIZE;

                const chunkSeed = this.worldManager.simpleHash(chunkX, chunkY, this.worldManager.worldSeed * 3);
                for (let i = 0; i < starsPerChunk; i++) {
                    const starSeed = chunkSeed + i * 79;
                    const starRelX = this.worldManager.seededRandom(starSeed * 17) * CHUNK_SIZE;
                    const starRelY = this.worldManager.seededRandom(starSeed * 29) * CHUNK_SIZE;
                    const starWorldX = chunkWorldX + starRelX;
                    const starWorldY = chunkWorldY + starRelY;

                    const screenX = starWorldX - camera.x;
                    const screenY = starWorldY - camera.y;

                    if (screenX > -10 && screenX < this.canvas.width + 10 && screenY > -10 && screenY < this.canvas.height + 10) {
                         ctx.fillRect(screenX, screenY, 2, 2);
                    }
                }
            }
        }
    }

    drawMinimap() {
        if (!this.minimapCtx || !this.player || !this.worldManager) return;

        const mapWidth = this.minimapCanvas.width;
        const mapHeight = this.minimapCanvas.height;
        const minimapWorldViewSize = CHUNK_SIZE * (LOAD_RADIUS * 2 + 1);
        const scale = mapWidth / minimapWorldViewSize;
        const viewWorldX = this.player.position.x - (mapWidth / scale / 2);
        const viewWorldY = this.player.position.y - (mapHeight / scale / 2);

        this.minimapCtx.fillStyle = 'rgba(10, 10, 10, 0.8)';
        this.minimapCtx.fillRect(0, 0, mapWidth, mapHeight);

        const activeSettlements = this.worldManager.getActiveSettlements();

        this.minimapCtx.fillStyle = '#888888';
        activeSettlements.forEach(settlement => {
            settlement.buildings.forEach(building => {
                const relativeX = building.position.x - viewWorldX;
                const relativeY = building.position.y - viewWorldY;
                const mapX = relativeX * scale;
                const mapY = relativeY * scale;
                const mapW = building.size.x * scale;
                const mapH = building.size.y * scale;

                if (mapX + mapW > 0 && mapX < mapWidth && mapY + mapH > 0 && mapY < mapHeight) {
                    this.minimapCtx.fillRect(mapX, mapY, Math.max(1, mapW), Math.max(1, mapH));
                }
            });
        });

        this.minimapCtx.fillStyle = '#ff3a3a';
        const playerMapX = mapWidth / 2;
        const playerMapY = mapHeight / 2;
        this.minimapCtx.beginPath();
        this.minimapCtx.arc(playerMapX, playerMapY, 3, 0, Math.PI * 2);
        this.minimapCtx.fill();
    }

    updateHUD() {
        if (this.player && this.rollIndicator) {
            if (this.player.dashCooldownTimer <= 0) {
                this.rollIndicator.classList.add('ready');
                this.rollIndicator.classList.remove('cooldown');
                this.rollIndicator.textContent = 'ROLL READY';
            } else {
                this.rollIndicator.classList.add('cooldown');
                this.rollIndicator.classList.remove('ready');
                this.rollIndicator.textContent = `ROLL (${this.player.dashCooldownTimer.toFixed(1)}s)`;
            }
        }
    }

    toggleInventory() {
        this.inventoryOpen = !this.inventoryOpen;
        this.inventoryScreen.classList.toggle('active', this.inventoryOpen);
        if (this.inventoryOpen) {
            this.updateInventoryDisplay();
        }
    }

    updateInventoryDisplay() {
        if (!this.player || !this.inventoryGrid) return;

        this.inventoryGrid.innerHTML = '';

        for (const itemType in this.player.inventory) {
            const count = this.player.inventory[itemType];
            if (count > 0) {
                const slot = document.createElement('div');
                slot.className = 'inventory-slot';

                const img = document.createElement('img');
                img.src = this.itemImagePaths[itemType] || '';
                img.alt = itemType;
                img.onerror = () => { img.style.display = 'none'; };
                slot.appendChild(img);

                const nameSpan = document.createElement('span');
                nameSpan.className = 'item-name';
                nameSpan.textContent = itemType.charAt(0).toUpperCase() + itemType.slice(1);
                slot.appendChild(nameSpan);

                const countSpan = document.createElement('span');
                countSpan.className = 'item-count';
                countSpan.textContent = count;
                slot.appendChild(countSpan);

                this.inventoryGrid.appendChild(slot);
            }
        }
    }

    showScreen(screen) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    startGame() {
        this.showScreen(this.gameScreen);
        this.initGame();
    }

    gameOver() {
        this.gameActive = false;
        this.finalPlasmaScoreDisplay.textContent = this.plasmaScore;
        this.showScreen(this.gameOverScreen);
    }

    handleInteraction() {
        if (!this.gameActive || !this.player || this.inventoryOpen) return;

        const target = this.player.interactTarget;

        if (target) {
            if (target.isDoor) {
                target.interact(this.player);
                console.log("Toggled door.");
            } else if (target.isStairs) {
                const interactionResult = target.interact(this.player);
                if (interactionResult) {
                    console.log(`Using stairs to floor ${interactionResult.targetFloor}`);
                    this.player.currentFloor = interactionResult.targetFloor;
                    this.player.position = interactionResult.targetPosition.clone();
                    this.updateCamera();
                }
            } else if (target.isContainer || target.isMedKit) {
                const drops = target.interact(this.player);
                if (drops && Array.isArray(drops) && drops.length > 0) {
                    const interactableType = target.isContainer ? 'Container' : 'MedKit';
                    console.log(`Interacted with ${interactableType}. Spawning drops...`);
                    drops.forEach(dropInfo => {
                        const spawnOffset = Vector2.fromAngle(Math.random() * Math.PI * 2, Math.random() * 15 + 10);
                        const spawnPos = target.position.add(spawnOffset);
                        const newDrop = new ItemDrop(spawnPos, dropInfo.type, dropInfo.quantity, this.player.currentFloor);
                        this.itemDrops.push(newDrop);
                        console.log(` --> Spawned drop: ${dropInfo.quantity} ${dropInfo.type} on floor ${this.player.currentFloor} at ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}`);
                    });
                } else {
                     console.log(`Interacted with already opened ${target.isContainer ? 'Container' : 'MedKit'}.`);
                }
            } else if (target.isGenerator) {
                const interactionResult = target.interact(this.player);
                if (interactionResult) {
                    console.log("Interacted with generator, plasma added directly.");
                } else {
                    console.log("Interacted with already used Generator.");
                }
            } else {
                console.warn("Attempted to interact with unknown target type:", target);
            }
        }
    }

    handlePickup() {
        if (!this.gameActive || !this.player || this.inventoryOpen || !this.player.pickupTarget) return;

        const targetDrop = this.player.pickupTarget;
        const distanceSq = this.player.position.distanceSq(targetDrop.position);
        const sameFloor = (!this.player.currentBuilding && targetDrop.floorIndex === 0) ||
                          (this.player.currentBuilding && targetDrop.floorIndex === this.player.currentFloor);

        if (distanceSq < targetDrop.pickupRadius * targetDrop.pickupRadius && sameFloor) {
            if (targetDrop.itemType in this.player.inventory) {
                this.player.inventory[targetDrop.itemType] += targetDrop.quantity;
                console.log(`Picked up ${targetDrop.quantity} ${targetDrop.itemType}. New total: ${this.player.inventory[targetDrop.itemType]}`);

                const index = this.itemDrops.indexOf(targetDrop);
                if (index > -1) {
                    this.itemDrops.splice(index, 1);
                }
                this.player.pickupTarget = null;
            } else {
                console.warn(`Attempted to pick up unknown item type: ${targetDrop.itemType}`);
                const index = this.itemDrops.indexOf(targetDrop);
                if (index > -1) {
                    this.itemDrops.splice(index, 1);
                }
                this.player.pickupTarget = null;
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    // Initial screen display is handled by CSS or could be triggered here if needed
    // game.showScreen(game.menuScreen);
});
