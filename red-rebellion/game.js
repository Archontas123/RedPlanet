import { Vector2, lineIntersectsRect, isLineOfSightClear } from './utils.js';
// Removed duplicate: import { Vector2 } from './math/Vector2.js';
import { Player, Projectile, Item, ItemDrop, Container, MedKit, Generator, Tree, MineralDeposit } from './entities.js';
import { Settlement } from './settlement.js';
import { PlayerSettlement } from './PlayerSettlement.js';
import { Door, StorageDepot, Building } from './structures.js'; // Import Building
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

        // Add these lines for off-screen canvas
        this.gameWidth = 1280;  // Fixed game resolution width
        this.gameHeight = 720;  // Fixed game resolution height
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = this.gameWidth;
        this.offscreenCanvas.height = this.gameHeight;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this.offscreenCtx.imageSmoothingEnabled = false; // Crucial for pixel art

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
        this.depotGuiScreen = document.getElementById('depot-gui-screen'); // Added
        this.depotPlayerInventoryGrid = document.getElementById('depot-player-inventory-grid'); // Added
        this.depotStorageInventoryGrid = document.getElementById('depot-storage-inventory-grid'); // Added
        this.closeDepotGuiButton = document.getElementById('close-depot-gui-button'); // Added
        this.locationDisplay = document.getElementById('location-display');

        this.gameActive = false;
        this.lastTime = 0;
        this.player = null;
        this.worldManager = null;
        this.projectiles = [];
        this.items = [];
        this.itemDrops = [];
        this.allTrees = []; // Add list to track active trees
        this.plasmaScore = 0;
        this.playerSettlement = null; // Add player settlement property
        this.inventoryOpen = false;
        this.depotGuiOpen = false; // State for depot GUI
        this.activeDepotGui = null; // Reference to the depot being interacted with
        this.camera = { x: 0, y: 0, zoom: 1.5 }; // Added zoom property
        this.mousePos = { x: 0, y: 0 };

        this.shownTreeTutorial = false; // Added for tree tutorial
        this.shownDepotTutorial = false; // Added for depot tutorial
        this.shownSettlementTutorial = false; // Added for settlement tutorial
        this.activeTutorialMessage = null; // Reference to the active tutorial message DOM element
        this.activeTutorialTimeoutId = null; // ID for the tutorial message removal timeout
        this.mineCooldown = 0;
        this.mineToolMessageTimer = 0;
        this.chopCooldown = 0;
        // Removed duplicate mineToolMessageTimer

        this.keys = {
            w: false, a: false, s: false, d: false,
            shift: false, e: false, space: false,
            f: false, v: false, p: false, c: false, m: false,
            u: false // Added 'u' key for layer switching
        };

        this.itemImagePaths = {
            rock: 'assets/items/rock.png',
            wood: 'assets/items/wood.png',
            food: 'assets/items/food.png', // Add new resource types if needed
            hide: 'assets/items/hide.png',
            heal: 'assets/items/heal.png',
            plasma: 'assets/items/plasma.png',
            axe: 'assets/items/axe.png', // Add tool images
            pickaxe: 'assets/items/pickaxe.png',
            knife: 'assets/items/knife.png',
            stone: 'assets/items/stone.png',
            iron: 'assets/items/iron.png',
            copper: 'assets/items/copper.png',
            titanium: 'assets/items/titanium.png',
            plasma_crystal: 'assets/items/plasma_crystal.png'
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
        this.closeDepotGuiButton.addEventListener('click', () => this.toggleDepotGui(null)); // Add listener for depot close button

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
            if (key === 'escape') { // Add Escape key listener
                if (this.depotGuiOpen) {
                    this.toggleDepotGui(null); // Close depot GUI
                    e.preventDefault();
                } else if (this.inventoryOpen) {
                    this.toggleInventory(); // Close inventory GUI
                    e.preventDefault();
                }
            } else if (this.activeTutorialMessage && key === 'x') { // Check for 'x' key if tutorial is active
                if (this.activeTutorialMessage.parentNode) {
                    this.activeTutorialMessage.parentNode.removeChild(this.activeTutorialMessage);
                    clearTimeout(this.activeTutorialTimeoutId);
                        this.activeTutorialMessage = null;
                        this.activeTutorialTimeoutId = null;
                        console.log("Tutorial closed with 'X' key.");
                    }
                    e.preventDefault(); // Prevent other 'x' actions if any
            } else if (key === 'v' && !this.depotGuiOpen) { // Prevent opening inventory if depot is open
                this.toggleInventory();
                this.keys.v = true;
                e.preventDefault();
            }

            // Always check this condition after handling specific keys like 'x' or 'v'
            if (!this.inventoryOpen && !this.depotGuiOpen) { // Only handle game keys if no GUI is open
                if (e.key === ' ') {
                    this.keys.space = true;
                } else if (key === this.player.interactKey) {
                    this.keys[key] = true;
                    this.handleInteraction();
                } else if (key === this.player.pickupKey) {
                    this.keys[key] = true;
                    // Removed direct call: this.handlePickup();
                } else if (key === 'c') { // Handle 'c' key down
                    this.keys.c = true;
                } else if (key === 'm') { // Handle 'm' key down
                    this.keys.m = true;
                } else if (key === 'u') { // Handle 'u' key down for layer toggle
                    this.keys.u = true;
                    this.toggleLayer(); // Call the toggle function
                } else if (key in this.keys) {
                    this.keys[key] = true;
                }
            }
        }
    }


    // --- Depot GUI Methods ---

    toggleDepotGui(depotInstance) {
        if (this.depotGuiOpen && this.activeDepotGui === depotInstance) {
            // Close the currently open GUI for this depot
            this.depotGuiOpen = false;
            this.activeDepotGui = null;
            this.depotGuiScreen.classList.remove('active');
            console.log("Closed Depot GUI");
        } else if (depotInstance && this.playerSettlement) {
            // Open the GUI for the specified depot
            this.depotGuiOpen = true;
            this.activeDepotGui = depotInstance; // Store reference if needed later
            this.inventoryOpen = false; // Close regular inventory if open
            this.inventoryScreen.classList.remove('active');
            this.depotGuiScreen.classList.add('active');
            this.updateDepotGuiDisplay();
            console.log("Opened Depot GUI");
        } else if (!depotInstance && this.depotGuiOpen) {
            // Close the GUI (called by close button or key press)
            this.depotGuiOpen = false;
            this.activeDepotGui = null;
            this.depotGuiScreen.classList.remove('active');
            console.log("Closed Depot GUI");
        }
    }

    updateDepotGuiDisplay() {
        if (!this.depotGuiOpen || !this.player || !this.playerSettlement || !this.depotPlayerInventoryGrid || !this.depotStorageInventoryGrid) return;

        // Clear previous content
        this.depotPlayerInventoryGrid.innerHTML = '';
        this.depotStorageInventoryGrid.innerHTML = '';

        const resourceTypes = ['wood', 'rock', 'food', 'hide', 'plasma', 'stone', 'iron', 'copper', 'titanium']; // Include mining resources

        // Populate Player Inventory side
        for (const itemType of resourceTypes) {
            const count = this.player.inventory[itemType] || 0;
            if (count > 0) { // Only show items the player has
                const slot = this.createDepotGuiSlot(itemType, count, true); // true indicates player side
                this.depotPlayerInventoryGrid.appendChild(slot);
            }
        }
         // Add empty slots if needed for layout, or just let it be sparse

        // Populate Depot Storage side
        for (const itemType of resourceTypes) {
            const count = this.playerSettlement.resources[itemType] || 0;
             if (count > 0) { // Only show items the depot has
                const slot = this.createDepotGuiSlot(itemType, count, false); // false indicates depot side
                this.depotStorageInventoryGrid.appendChild(slot);
            }
        }
         // Add empty slots if needed for layout
    }

    createDepotGuiSlot(itemType, count, isPlayerSide) {
        const slot = document.createElement('div');
        slot.className = 'depot-slot';

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

        // Add click listener for transfer with modifiers
        slot.addEventListener('click', (event) => {
            const sourceAmount = isPlayerSide ? (this.player.inventory[itemType] || 0) : (this.playerSettlement.resources[itemType] || 0);
            let transferAmount = 0;

            if (event.ctrlKey) {
                // Ctrl + Click: Transfer all
                transferAmount = sourceAmount;
            } else if (event.shiftKey) {
                // Shift + Click: Transfer 10
                transferAmount = Math.min(10, sourceAmount);
            } else {
                // Simple Click: Transfer 1
                transferAmount = Math.min(1, sourceAmount);
            }

            if (transferAmount <= 0) return; // Nothing to transfer

            if (isPlayerSide) {
                this.transferToDepot(itemType, transferAmount);
            } else {
                this.transferToPlayer(itemType, transferAmount);
            }
        });

        return slot;
    }

    transferToDepot(resourceType, amount) {
        if (!this.depotGuiOpen || !this.player || !this.playerSettlement) return;

        const playerAmount = this.player.inventory[resourceType] || 0;
        const depotCurrentAmount = this.playerSettlement.resources[resourceType] || 0;
        const depotSpaceAvailable = this.playerSettlement.maxStackSize - depotCurrentAmount;

        // Determine actual amount based on request, player stock, and depot space
        const amountToTry = Math.min(amount, playerAmount); // Can't transfer more than player has
        const transferAmount = Math.min(amountToTry, depotSpaceAvailable); // Can't transfer more than depot can hold

        if (transferAmount > 0) {
            this.player.inventory[resourceType] -= transferAmount;
            // addResource already handles the stack limit check internally, but we log based on the calculated transferAmount
            this.playerSettlement.addResource(resourceType, transferAmount); // Add the calculated valid amount
            console.log(`Transferred ${transferAmount} ${resourceType} to depot.`);
            this.updateDepotGuiDisplay(); // Refresh GUI
            this.updateInventoryDisplay(); // Refresh main inventory display if it was open
            if (transferAmount < amountToTry) {
                 console.log(`Depot storage for ${resourceType} full. Could not transfer ${amountToTry - transferAmount} ${resourceType}.`);
            }
        } else {
            console.log(`Not enough ${resourceType} in player inventory to transfer.`);
        }
    }

    transferToPlayer(resourceType, amount) {
        if (!this.depotGuiOpen || !this.player || !this.playerSettlement) return;

        const depotAmount = this.playerSettlement.resources[resourceType] || 0;
        const currentAmountPlayer = this.player.inventory[resourceType] || 0;
        const spaceAvailablePlayer = this.player.maxStackSize - currentAmountPlayer;

        // Determine the actual amount to transfer based on request, depot stock, and player space
        const amountToTry = Math.min(amount, depotAmount); // Can't take more than depot has
        const transferAmount = Math.min(amountToTry, spaceAvailablePlayer); // Can't take more than player can hold

        if (transferAmount > 0) {
            this.playerSettlement.removeResource(resourceType, transferAmount);
            this.player.inventory[resourceType] = currentAmountPlayer + transferAmount;
            console.log(`Transferred ${transferAmount} ${resourceType} to player.`);
            this.updateDepotGuiDisplay(); // Refresh GUI
            this.updateInventoryDisplay(); // Refresh main inventory display if it was open
            if (transferAmount < amountToTry) {
                console.log(`Player inventory for ${resourceType} full. Could not transfer ${amountToTry - transferAmount} ${resourceType}.`);
            }
        } else {
            console.log(`Not enough ${resourceType} in depot storage to transfer.`);
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
                } else if (key === 'c') { // Handle 'c' key up
                    this.keys.c = false;
                } else if (key === 'm') { // Handle 'm' key up
                    this.keys.m = false;
                } else if (key === 'u') { // Handle 'u' key up
                    this.keys.u = false;
                } else if (key in this.keys) {
                    this.keys[key] = false;
                }
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();

        // Convert screen coordinates to game coordinates
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Calculate the scaling ratio between screen and game
        const scaleX = this.canvas.width / this.gameWidth;
        const scaleY = this.canvas.height / this.gameHeight;

        // Convert to game coordinates, then apply camera
        const gameX = (screenX / scaleX);
        const gameY = (screenY / scaleY);

        // Store the world coordinates
        this.mousePos.x = gameX / this.camera.zoom + this.camera.x;
        this.mousePos.y = gameY / this.camera.zoom + this.camera.y;
    }

    handleMouseDown(e) {
        // Prevent clicks if inventory or depot GUI is open
        if (this.inventoryOpen || this.depotGuiOpen) return;

        if (e.button === 0 && this.gameActive && this.player && this.worldManager) {
            const equippedWeapon = this.player.weapons[this.player.currentWeaponIndex];
            const toolTypes = ['Axe', 'Pickaxe', 'Knife']; // Define which weapons are tools

            if (toolTypes.includes(equippedWeapon)) {
                // Tool is equipped, try to interact with entity near mouse
                // mousePos is now already in world coordinates
                const clickPos = new Vector2(this.mousePos.x, this.mousePos.y);
                const interactionRadiusSq = 50 * 50; // How close the click needs to be

                let targetEntity = null;

                // Check trees
                for (const tree of this.allTrees) {
                    if (tree.health > 0 && clickPos.distanceSq(tree.position) < interactionRadiusSq + tree.interactionRadius * tree.interactionRadius) {
                         // Check if the tool matches the requirement
                             if (tree.requiredTool && equippedWeapon.toLowerCase() === tree.requiredTool.toLowerCase()) {
                                targetEntity = tree;
                                break;
                             }
                    }
                }

                // TODO: Add checks for Rocks (Pickaxe), Animals (Knife after kill) here

                if (targetEntity) {
                    console.log(`Using ${equippedWeapon} on ${targetEntity.type}`);
                    const interactionResult = targetEntity.interact(this.player, this);
                    if (interactionResult && interactionResult.felled) {
                        // Remove felled tree (already handled in handleInteraction, but maybe needed here too?)
                        // For now, interact handles the drop, health reduction.
                        // We might need cooldowns for tool swings later.
                    }
                } else {
                    // Optional: Play a 'miss' sound or animation if clicking with a tool but not hitting anything valid
                    console.log(`Clicked with ${equippedWeapon}, no valid target.`);
                     // If it's the knife, still perform the attack function for combat
                     if (equippedWeapon === 'Knife') {
                         this.player.attack(this.mousePos, this.camera, this.projectiles, this.worldManager.getActiveSettlements());
                     }
                }

            } else {
                // For gun/shotgun attacks, we need to adjust coordinates
                const rect = this.canvas.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;

                // Convert to game coordinates
                const scaleX = this.canvas.width / this.gameWidth;
                const scaleY = this.canvas.height / this.gameHeight;
                const gameX = (screenX / scaleX);
                const gameY = (screenY / scaleY);

                // Calculate direction from player to this point for attack
                const attackScreenPos = {
                    x: (gameX - this.gameWidth/2) * this.camera.zoom,
                    y: (gameY - this.gameHeight/2) * this.camera.zoom
                };

                this.player.attack(attackScreenPos, this.camera, this.projectiles, this.worldManager.getActiveSettlements());
            }
        }
        // Note: Right-click (e.button === 2) is currently prevented by contextmenu listener
    }

    handleResize() {
        // Keep the canvas filling the window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // We don't resize the offscreen canvas, it stays at fixed resolution
    }

    handleInteraction() {
        // This function handles pressing the interact key (F)
        if (!this.player || !this.gameActive) return;

        if (this.player.interactTarget) {
            const target = this.player.interactTarget; // Simplify access

            if (target.type === 'StorageDepot') {
                // Handle depot interaction by toggling the depot GUI
                target.interact(this.player, this.playerSettlement, this);
            } else if (target.isDoor) {
                target.interact();
            } else if (target.isStairs) {
                const result = target.interact();
                if (result && typeof result.targetFloor === 'number') {
                    this.player.currentFloor = result.targetFloor;
                    if (result.targetPosition) {
                        this.player.position = result.targetPosition.clone();
                    }
                }
            } else if (target.isContainer || target.isMedKit || target.isGenerator) {
                // Directly interact with the container/medkit/generator
                const result = target.interact(this.player, this); // Assuming this signature
                // Handle potential drops if the interaction returns them
                if (result && Array.isArray(result)) {
                     result.forEach(drop => {
                         const dropPos = this.player.position.add(new Vector2(Math.random() * 40 - 20, Math.random() * 40 - 20));
                         // Determine floor index based on player's current state
                         const floorIndex = this.player.currentBuilding ? this.player.currentFloor : 0;
                         const newDrop = new ItemDrop(dropPos, drop.type, drop.quantity, floorIndex);
                         this.itemDrops.push(newDrop);
                     });
                }
            }
            // Note: Removed the 'else if (this.player.currentBuilding)' check here,
            // as the specific checks above should handle interactables correctly,
            // relying on Player.js to find the correct target.

        }
    }

    initGame() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Set up offscreen canvas
        this.offscreenCanvas.width = this.gameWidth;
        this.offscreenCanvas.height = this.gameHeight;
        this.offscreenCtx.imageSmoothingEnabled = false;

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

        // Update the player's inventory to include mining resources
        this.player.inventory = {
            wood: 0,
            rock: 0,
            food: 0,
            hide: 0,
            heal: 0,
            plasma: 0,
            stone: 0,    // Add new mining resources
            iron: 0,
            copper: 0,
            titanium: 0,
            plasma_crystal: 0
            // Tools are now weapons, not inventory items
        };

        // Create the player settlement near the start position
        const settlementOffset = new Vector2(0, 100); // Place it slightly below the player start
        this.playerSettlement = new PlayerSettlement(startPos.add(settlementOffset));

        this.projectiles = [];
        this.items = [];
        this.itemDrops = [];
        this.allTrees = []; // Reset trees on game init
        this.plasmaScore = 0;
        this.updateScoreDisplay();

        this.shownTreeTutorial = false; // Reset tree tutorial flag
        this.shownDepotTutorial = false; // Reset depot tutorial flag
        this.shownSettlementTutorial = false; // Reset settlement tutorial flag

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
        const activeTrees = this.worldManager.getActiveTrees();
        const activeDecorations = this.worldManager.getActiveDecorations();
        this.allTrees = activeTrees; // Update the game's list (simple approach for now)

        // --- GAME LOGIC UPDATES ---
        // Only update game state if no GUI is open
        if (!this.inventoryOpen && !this.depotGuiOpen) {
            this.worldManager.updateActiveChunks(this.player.position.x, this.player.position.y);

            this.player.update(deltaTime, this.keys, this.worldManager, this.healthFill, this.weaponDisplay, this.projectiles, this.itemDrops, this);

            // Check for nearby trees to show tutorial
            if (!this.shownTreeTutorial) {
                for (const tree of this.allTrees) {
                    if (!tree.isFelled && this.player.position.distance(tree.position) < 150) { // Adjust distance as needed
                        this.showTutorialMessage("Tree Discovered! Equip your Axe and hold 'C' near trees to chop them down for wood.", 'tree');
                        this.shownTreeTutorial = true;
                        break;
                    }
                }
            }

            // Check for nearby player depot to show tutorial
            if (!this.shownDepotTutorial && this.playerSettlement) {
                const depot = this.playerSettlement.structures.find(s => s instanceof StorageDepot);
                if (depot && this.player.position.distance(depot.position) < 150) { // Adjust distance as needed
                    this.showTutorialMessage("Storage Depot Found! Press 'F' near your depot to open the storage interface and transfer resources.", 'depot');
                    this.shownDepotTutorial = true;
                }
            }

            // Check for nearby enemy settlements to show tutorial (Optional - might be too spammy)
            // if (!this.shownSettlementTutorial) {
            //     for (const settlement of activeSettlements) {
            //         // Check distance to settlement center or a key building
            //         if (this.player.position.distance(settlement.position) < 300) { // Adjust distance
            //             this.showTutorialMessage("Enemy Settlement Nearby! Be cautious, they may defend their territory. Look for resources or plasma.", 'settlement');
            //             this.shownSettlementTutorial = true;
            //             break;
            //         }
            //     }
            // }

            // Handle chopping action
            if (this.keys.c && this.player.chopTarget) {
                const equippedWeapon = this.player.weapons[this.player.currentWeaponIndex];
                if (equippedWeapon === 'Axe') {
                    // Apply damage over time while holding 'c'
                    // Need a damage rate and potentially a cooldown/timer mechanism here
                    // For simplicity now, let's call takeDamage directly, but this will be very fast.
                    // A better approach would involve a timer or applying damage proportional to deltaTime.
                    // Let's add a simple cooldown for chopping.
                    if (!this.chopCooldown || this.chopCooldown <= 0) {
                        const chopDamage = 25; // Example damage per chop action
                        this.player.chopTarget.takeDamage(chopDamage, this.player, 'axe'); // Pass player as source
                        this.chopCooldown = 0.5; // Cooldown in seconds between chops
                        console.log(`Chopping tree with Axe. Health: ${this.player.chopTarget.health}`);
                        // Check if tree was felled by this chop
                        if (this.player.chopTarget.isFelled) {
                            this.handleTreeFelled(this.player.chopTarget);
                            this.player.chopTarget = null; // Clear target after felling
                        }
                    }
                } else {
                    // Optional: Show a message "Axe required" or similar
                }
            }

            // Update cooldown timers
            if (this.chopCooldown > 0) {
                this.chopCooldown -= deltaTime;
            }
            if (this.mineCooldown > 0) {
                this.mineCooldown -= deltaTime;
            }
            if (this.mineToolMessageTimer > 0) {
                this.mineToolMessageTimer -= deltaTime;
            }
 
             activeSettlements.forEach(settlement => settlement.update(deltaTime, this.player, isLineOfSightClear, this.projectiles, this));
 
             this.projectiles.forEach(p => p.update(deltaTime, this.worldManager, this.player, () => this.gameOver(), this)); // Pass 'this' (game instance)
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

            this.playerSettlement.update(deltaTime); // Update player settlement
            this.updateCamera();

            // --- Continuous Pickup Logic (Moved from handlePickup) ---
            if (this.keys[this.player.pickupKey] && this.player.pickupTarget) {
                const targetDrop = this.player.pickupTarget;
                const distanceSq = this.player.position.distanceSq(targetDrop.position);
                const sameFloor = (!this.player.currentBuilding && targetDrop.floorIndex === 0) ||
                                  (this.player.currentBuilding && targetDrop.floorIndex === this.player.currentFloor);

                if (distanceSq < targetDrop.pickupRadius * targetDrop.pickupRadius && sameFloor) {
                    const itemType = targetDrop.itemType;
                    if (itemType in this.player.inventory) {
                        const currentAmount = this.player.inventory[itemType] || 0;
                        const spaceAvailable = this.player.maxStackSize - currentAmount;
                        const amountToPickup = Math.min(targetDrop.quantity, spaceAvailable);

                        if (amountToPickup > 0) {
                            this.player.inventory[itemType] = currentAmount + amountToPickup;
                            // console.log(`Picked up ${amountToPickup} ${itemType}. New total: ${this.player.inventory[itemType]}`); // Optional: Reduce console spam

                            targetDrop.quantity -= amountToPickup;
                            if (targetDrop.quantity <= 0) {
                                const index = this.itemDrops.indexOf(targetDrop);
                                if (index > -1) {
                                    this.itemDrops.splice(index, 1);
                                }
                                this.player.pickupTarget = null; // Clear target if drop is gone
                            }
                            this.updateInventoryDisplay(); // Update inventory display if open
                        } else {
                            // console.log(`Inventory full for ${itemType}. Cannot pick up.`); // Optional: Reduce console spam
                        }
                    } else {
                        console.warn(`Attempted to pick up unknown item type: ${itemType}`);
                        const index = this.itemDrops.indexOf(targetDrop);
                        if (index > -1) {
                            this.itemDrops.splice(index, 1);
                        }
                        this.player.pickupTarget = null;
                    }
                }
            }
            // --- End Continuous Pickup Logic ---
        } else if (this.depotGuiOpen) {
            // Optional: Could add subtle background updates or animations even when GUI is open
        }

        // --- RENDERING SECTION ---
        // Clear the offscreen canvas
        this.offscreenCtx.clearRect(0, 0, this.gameWidth, this.gameHeight);

        // --- Apply Camera Transformations to offscreen context ---
        this.offscreenCtx.save();
        this.offscreenCtx.scale(this.camera.zoom, this.camera.zoom);
        this.offscreenCtx.translate(-this.camera.x, -this.camera.y);

        // Draw normal world background (NOW INSIDE TRANSFORM)
        this.drawBackground(this.offscreenCtx, this.camera);

        // Draw stars (Moved from drawBackground and adjusted)
        this.drawStars(this.offscreenCtx, this.camera);

        const isPlayerInside = !!this.player.currentBuilding;

        // --- Collect and Sort Drawable Entities based on Player Layer ---
        let drawableEntities = [];
        // let currentObstacles = []; // Obstacles are handled in Player.update

        // Get entities based on the player's current layer
        if (this.player.currentLayer === 'surface') {
            // Surface Layer Entities
            activeSettlements.forEach(settlement => {
                drawableEntities = drawableEntities.concat(settlement.buildings);
                // Add humans (only if visible on current floor/outside)
                settlement.humans.forEach(human => {
                    const sameFloor = isPlayerInside && human.building === this.player.currentBuilding && human.currentFloor === this.player.currentFloor;
                    const bothOutside = !isPlayerInside && !human.building;
                    if (sameFloor || bothOutside) {
                        drawableEntities.push(human);
                    }
                });
            });

            // Add non-felled trees (only if player is outside)
            if (!isPlayerInside) {
                 this.allTrees.forEach(tree => { // allTrees currently holds surface trees
                     if (!tree.isFelled) {
                         drawableEntities.push(tree);
                     }
                 });
            }

            // Add surface items (only if player is outside)
             this.items.forEach(item => { // Assuming items are surface only for now
                 if (!isPlayerInside) {
                      drawableEntities.push(item);
                 }
             });

            // Add surface item drops (only if visible on current floor/outside)
            this.itemDrops.forEach(drop => { // Assuming drops are surface only for now (needs layer property later)
                const sameFloor = (!isPlayerInside && drop.floorIndex === 0) ||
                                  (isPlayerInside && drop.floorIndex === this.player.currentFloor);
                if (sameFloor) {
                    drawableEntities.push(drop);
                }
            });

            // Add player settlement structures (assuming surface only)
            if (this.playerSettlement) {
                 drawableEntities = drawableEntities.concat(this.playerSettlement.structures);
            }

            // Add surface decorations (only if player is outside)
            if (!isPlayerInside) {
                drawableEntities = drawableEntities.concat(activeDecorations); // Assumes activeDecorations are surface
            }

        } else if (this.player.currentLayer === 'underground') {
            // Underground Layer Entities
            // TODO: Add logic to get and add underground entities
            // Example:
            // const undergroundEntities = this.worldManager.getActiveUndergroundEntities(); // Needs implementation
            // drawableEntities = drawableEntities.concat(undergroundEntities);
            // const undergroundDecorations = this.worldManager.getActiveUndergroundDecorations(); // Needs implementation
            // drawableEntities = drawableEntities.concat(undergroundDecorations);
            // Add underground item drops if they exist and have a layer property
            this.itemDrops.forEach(drop => {
                if (drop.layer === 'underground') { // Needs ItemDrop modification later
                     drawableEntities.push(drop);
                }
            });
        }

        // Add projectiles
        drawableEntities = drawableEntities.concat(this.projectiles);

        // Add the player
        if (this.player) {
            drawableEntities.push(this.player);
        }

        // Sort by the 'bottom' Y coordinate using getSortY(), with X as a tie-breaker for stability
        drawableEntities.sort((a, b) => {
            const yA = typeof a.getSortY === 'function' ? a.getSortY() : a.position.y;
            const yB = typeof b.getSortY === 'function' ? b.getSortY() : b.position.y;
            const yDiff = yA - yB;
            // Increase tolerance slightly for tie-breaking
            if (Math.abs(yDiff) < 0.1) { // If Y is very close, use X to break the tie
                return a.position.x - b.position.x;
            }
            return yDiff;
        });

        // --- Draw Sorted Entities to offscreen canvas ---
        drawableEntities.forEach(entity => {
            // Buildings need special draw parameters
            if (entity instanceof Building) {
                const drawFloor = isPlayerInside && this.player.currentBuilding === entity ? this.player.currentFloor : 0;
                const drawInterior = isPlayerInside && this.player.currentBuilding === entity;
                entity.draw(this.offscreenCtx, this.camera, drawFloor, drawInterior);
            } else {
                // Ensure other entities have a standard draw method or handle appropriately
                if (typeof entity.draw === 'function') {
                    entity.draw(this.offscreenCtx, this.camera);
                }
            }
        });

        // Draw interaction prompts (like [F] Open Door) to offscreen canvas
        // These are drawn in world coordinates so they should remain with the entities
        if (this.player.interactTarget) {
            let interactText = 'Interact';
            if (this.player.interactTarget?.type === 'StorageDepot') interactText = 'Deposit Resources';
            else if (this.player.interactTarget?.isDoor) interactText = 'Open/Close Door';
            else if (this.player.interactTarget?.isGenerator) interactText = 'Siphon Plasma';
            else if (this.player.interactTarget?.isContainer) interactText = 'Open Container';
            else if (this.player.interactTarget?.isMedKit) interactText = 'Open MedKit';
            else if (this.player.interactTarget?.isStairs) interactText = 'Use Stairs';

            // Draw hints relative to player, scaling font/offset inversely with zoom
            const fontSize = 16 / this.camera.zoom;
            const yOffsetBase = -this.player.visualSize.y / 2 - (15 / this.camera.zoom);
            this.offscreenCtx.fillStyle = 'white';
            this.offscreenCtx.font = `${fontSize}px Orbitron`;
            this.offscreenCtx.textAlign = 'center';
            this.offscreenCtx.fillText(`[${this.player.interactKey.toUpperCase()}] ${interactText}`, this.player.position.x, this.player.position.y + yOffsetBase);
            this.offscreenCtx.textAlign = 'left'; // Reset alignment
        }

        // Draw pickup hints
        const fontSize = 16 / this.camera.zoom;
        const hintSpacing = 25 / this.camera.zoom; // Increased spacing
        let hintOffsetY = -this.player.visualSize.y / 2 - (15 / this.camera.zoom);

        if (this.player.interactTarget) {
            hintOffsetY -= hintSpacing; // Move subsequent hints down if interact hint is shown
        }

        if (this.player.pickupTarget) {
            this.offscreenCtx.fillStyle = 'yellow';
            this.offscreenCtx.font = `${fontSize}px Orbitron`;
            this.offscreenCtx.textAlign = 'center';
            this.offscreenCtx.fillText(`[${this.player.pickupKey.toUpperCase()}] Pick Up ${this.player.pickupTarget.itemType}`, this.player.position.x, this.player.position.y + hintOffsetY);
            this.offscreenCtx.textAlign = 'left';
            hintOffsetY -= hintSpacing; // Move subsequent hints down
        }

        if (this.player.chopTarget) {
            this.offscreenCtx.fillStyle = 'orange';
            this.offscreenCtx.font = `${fontSize}px Orbitron`;
            this.offscreenCtx.textAlign = 'center';
            this.offscreenCtx.fillText(`[Hold C] Chop Tree`, this.player.position.x, this.player.position.y + hintOffsetY);
            this.offscreenCtx.textAlign = 'left';
            hintOffsetY -= hintSpacing;
        }

        // --- Restore offscreen context ---
        this.offscreenCtx.restore();

        // --- Draw offscreen canvas to main canvas ---
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Disable smoothing again to ensure crisp pixels
        this.ctx.imageSmoothingEnabled = false;

        // Draw the offscreen canvas to the main canvas, scaled to fit
        this.ctx.drawImage(
            this.offscreenCanvas,
            0, 0, this.gameWidth, this.gameHeight,
            0, 0, this.canvas.width, this.canvas.height
        );

        // --- Draw HUD directly on the main canvas ---
        // These remain crisp regardless of game scaling
        this.updateHUD();

        this.drawMinimap();

        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    updateCamera() {
        // Center camera on player, but adjust for the fixed game resolution
        this.camera.x = this.player.position.x - (this.gameWidth / this.camera.zoom / 2);
        this.camera.y = this.player.position.y - (this.gameHeight / this.camera.zoom / 2);
    }

    drawBackground(ctx, camera) {
        // Background should fill the visible world area
        if (this.groundPattern) {
            ctx.fillStyle = this.groundPattern;
            // Fill the visible world area. Since we are inside the translated context,
            // drawing from camera.x, camera.y covers the correct world space.
            // The pattern origin aligns automatically due to the context translation.
            const viewWidthWorld = this.gameWidth / camera.zoom;
            const viewHeightWorld = this.gameHeight / camera.zoom;
            ctx.fillRect(camera.x, camera.y, viewWidthWorld, viewHeightWorld);
        } else {
           ctx.fillStyle = '#4d1a00'; // Fallback color
           const viewWidthWorld = this.gameWidth / camera.zoom;
           const viewHeightWorld = this.gameHeight / camera.zoom;
           ctx.fillRect(camera.x, camera.y, viewWidthWorld, viewHeightWorld);
        }
        // Star drawing logic moved to gameLoop to be within the same transform context
    }

    drawStars(ctx, camera) {
        // Draw stars - calculate visibility based on game dimensions
        // This is now called within the transformed context (scaled and translated)
        ctx.fillStyle = 'rgba(255, 255, 200, 0.6)';
        const starsPerChunk = 10;
        // Calculate the visible world area based on camera and zoom
        const viewWidthWorld = this.gameWidth / camera.zoom;
        const viewHeightWorld = this.gameHeight / camera.zoom;
        const viewLeftWorld = camera.x;
        const viewTopWorld = camera.y;
        const viewRightWorld = viewLeftWorld + viewWidthWorld;
        const viewBottomWorld = viewTopWorld + viewHeightWorld;

        // Determine the range of chunks to check based on the visible world area
        const startChunkX = Math.floor(viewLeftWorld / CHUNK_SIZE) - 1; // Add buffer
        const endChunkX = Math.floor(viewRightWorld / CHUNK_SIZE) + 1;
        const startChunkY = Math.floor(viewTopWorld / CHUNK_SIZE) - 1;
        const endChunkY = Math.floor(viewBottomWorld / CHUNK_SIZE) + 1;

        for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
            for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
                const chunkWorldX = chunkX * CHUNK_SIZE;
                const chunkWorldY = chunkY * CHUNK_SIZE;
                const chunkSeed = this.worldManager.simpleHash(chunkX, chunkY, this.worldManager.worldSeed * 3);

                for (let i = 0; i < starsPerChunk; i++) {
                    const starSeed = chunkSeed + i * 79;
                    const starRelX = this.worldManager.seededRandom(starSeed * 17) * CHUNK_SIZE;
                    const starRelY = this.worldManager.seededRandom(starSeed * 29) * CHUNK_SIZE;
                    const starWorldX = chunkWorldX + starRelX;
                    const starWorldY = chunkWorldY + starRelY;

                    // Check if the star's world position is within the visible area
                    if (starWorldX >= viewLeftWorld && starWorldX <= viewRightWorld &&
                        starWorldY >= viewTopWorld && starWorldY <= viewBottomWorld) {
                        // Draw directly at world coordinates, context handles transform
                        const starSize = 2 / camera.zoom; // Star size in world units (adjust as needed)
                        ctx.fillRect(starWorldX - starSize / 2, starWorldY - starSize / 2, starSize, starSize);
                    }
                }
            }
        }
    }

    drawMinimap() {
        if (!this.minimapCtx || !this.player || !this.worldManager) return;

        const mapWidth = this.minimapCanvas.width;
        const mapHeight = this.minimapCanvas.height;
        // Fixed view size for minimap consistency
        const minimapWorldViewSize = CHUNK_SIZE * (LOAD_RADIUS * 2 + 1);
        const scale = mapWidth / minimapWorldViewSize;
        const viewWorldX = this.player.position.x - (mapWidth / scale / 2);
        const viewWorldY = this.player.position.y - (mapHeight / scale / 2);

        this.minimapCtx.fillStyle = 'rgba(10, 10, 10, 0.8)';
        this.minimapCtx.fillRect(0, 0, mapWidth, mapHeight);

        // --- Minimap always draws SURFACE data ---
        const activeSurfaceSettlements = this.worldManager.getActiveSettlements(); // Assumes this gets surface settlements

        this.minimapCtx.fillStyle = '#888888'; // Buildings color
        activeSurfaceSettlements.forEach(settlement => {
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

        // --- Draw Player's Storage Depot ---
        if (this.playerSettlement && this.playerSettlement.structures) {
            const depot = this.playerSettlement.structures.find(s => s instanceof StorageDepot);
            if (depot) {
                const depotWorldX = depot.position.x;
                const depotWorldY = depot.position.y;
                const relativeX = depotWorldX - viewWorldX;
                const relativeY = depotWorldY - viewWorldY;
                const mapX = relativeX * scale;
                const mapY = relativeY * scale;
                const mapSize = 5; // Size of the depot icon on the map

                // Check if the depot is within the minimap bounds
                if (mapX >= 0 && mapX <= mapWidth && mapY >= 0 && mapY <= mapHeight) {
                    // Draw the depot icon (e.g., a green square)
                    this.minimapCtx.fillStyle = '#00ff00'; // Bright green
                    this.minimapCtx.fillRect(mapX - mapSize / 2, mapY - mapSize / 2, mapSize, mapSize);
                } else {
                    // --- Draw Direction Indicator if Depot is Off-Screen ---
                    // Calculate angle from player (center of minimap) to depot
                    const angleToDepot = Math.atan2(depotWorldY - this.player.position.y, depotWorldX - this.player.position.x);

                    // Calculate the position on the edge of the minimap
                    const edgeDist = mapWidth / 2 - 5; // Distance from center to edge, with a small margin
                    const indicatorX = playerMapX + Math.cos(angleToDepot) * edgeDist;
                    const indicatorY = playerMapY + Math.sin(angleToDepot) * edgeDist;

                    // Clamp the indicator position to the minimap boundaries
                    const clampedX = Math.max(5, Math.min(mapWidth - 5, indicatorX));
                    const clampedY = Math.max(5, Math.min(mapHeight - 5, indicatorY));

                    // Draw the indicator (e.g., a small green triangle pointing towards the depot)
                    this.minimapCtx.save();
                    this.minimapCtx.translate(clampedX, clampedY);
                    this.minimapCtx.rotate(angleToDepot);
                    this.minimapCtx.fillStyle = '#00ff00'; // Bright green
                    this.minimapCtx.beginPath();
                    this.minimapCtx.moveTo(0, 0); // Point of the triangle
                    this.minimapCtx.lineTo(-6, -3);
                    this.minimapCtx.lineTo(-6, 3);
                    this.minimapCtx.closePath();
                    this.minimapCtx.fill();
                    this.minimapCtx.restore();
                }
            }
        }
        // --- End Draw Player's Storage Depot ---
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

        // Update location display based on player's current layer
        if (this.player && this.locationDisplay) {
            const layerName = this.player.currentLayer.charAt(0).toUpperCase() + this.player.currentLayer.slice(1);
            this.locationDisplay.textContent = `Location: ${layerName}`;
            // Optional: Add specific class for underground styling if needed
            if (this.player.currentLayer === 'underground') {
                 this.locationDisplay.classList.add('cave-location'); // Or a new 'underground-location' class
            } else {
                 this.locationDisplay.classList.remove('cave-location');
            }
        }
    }

    // --- Layer Switching ---
    toggleLayer() {
        if (!this.player) return;

        if (this.player.currentLayer === 'surface') {
            this.player.currentLayer = 'underground';
            console.log("Switched to Underground layer");
            // TODO: Potentially add visual/audio feedback for layer switch
            // TODO: Reset interaction targets as they are layer-specific
            this.player.interactTarget = null;
            this.player.pickupTarget = null;
            this.player.chopTarget = null;
            this.player.mineTarget = null;
        } else {
            this.player.currentLayer = 'surface';
            console.log("Switched to Surface layer");
            // TODO: Potentially add visual/audio feedback for layer switch
            // TODO: Reset interaction targets
            this.player.interactTarget = null;
            this.player.pickupTarget = null;
            this.player.chopTarget = null;
            this.player.mineTarget = null;
        }
        this.updateHUD(); // Update HUD immediately after switching
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

    // --- Tutorial Message Helper ---
    showTutorialMessage(message, tutorialType) {
        console.log(`Tutorial (${tutorialType}): ${message}`);

        // Ensure only one tutorial message exists at a time
        if (this.activeTutorialMessage && this.activeTutorialMessage.parentNode) {
            this.activeTutorialMessage.parentNode.removeChild(this.activeTutorialMessage);
            clearTimeout(this.activeTutorialTimeoutId);
        }

        this.activeTutorialMessage = document.createElement('div');
        this.activeTutorialMessage.className = 'tutorial-message'; // Use existing class or create new ones

        const messageText = document.createElement('span');
        messageText.textContent = `${message} (Press 'X' to close)`;
        this.activeTutorialMessage.appendChild(messageText);

        const closeButton = document.createElement('button');
        closeButton.className = 'tutorial-close-button';
        closeButton.textContent = 'X';

        const currentTutorialMsg = this.activeTutorialMessage;

        document.body.appendChild(currentTutorialMsg);

        // Timeout to auto-remove
        this.activeTutorialTimeoutId = setTimeout(() => {
            if (currentTutorialMsg.parentNode) {
                currentTutorialMsg.parentNode.removeChild(currentTutorialMsg);
                if (this.activeTutorialMessage === currentTutorialMsg) {
                    this.activeTutorialMessage = null;
                    this.activeTutorialTimeoutId = null;
                }
            }
        }, 10000); // Increased duration slightly

        // Button click handler
        closeButton.onclick = () => {
            if (currentTutorialMsg.parentNode) {
                currentTutorialMsg.parentNode.removeChild(currentTutorialMsg);
                clearTimeout(this.activeTutorialTimeoutId);
                if (this.activeTutorialMessage === currentTutorialMsg) {
                    this.activeTutorialMessage = null;
                    this.activeTutorialTimeoutId = null;
                }
            }
        };

        currentTutorialMsg.appendChild(closeButton);
    }
    // --- End Tutorial Message Helper ---

    // Helper function to handle resource drops when a tree is felled
    handleTreeFelled(tree) {
        console.log("Tree felled, dropping resources...");
        const drops = tree.getResourceDrops(); // Assuming Tree has this method
        if (drops && Array.isArray(drops) && drops.length > 0) {
            drops.forEach(dropInfo => {
                const spawnOffset = Vector2.fromAngle(Math.random() * Math.PI * 2, Math.random() * 15 + 10);
                const spawnPos = tree.position.add(spawnOffset);
                // Trees are always on floor 0
                const newDrop = new ItemDrop(spawnPos, dropInfo.type, dropInfo.quantity, 0);
                this.itemDrops.push(newDrop);
                // Removed misplaced else if/else blocks
            }); // End drops.forEach
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    // Initial screen display is handled by CSS or could be triggered here if needed
    // game.showScreen(game.menuScreen);
});
