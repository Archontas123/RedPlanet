import { Vector2, lineIntersectsRect, isLineOfSightClear } from './utils.js';
import { Player, Projectile, Item, Chest } from './entities.js'; // Import Item and Chest
import { Settlement } from './settlement.js';
import { Door } from './structures.js'; // Import Door

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const startButton = document.getElementById('start-button');
    const retryButton = document.getElementById('retry-button');
    const menuScreen = document.getElementById('menu-screen');
    const gameScreen = document.getElementById('game-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // Disable image smoothing for pixel art
    const minimapCanvas = document.getElementById('minimap-canvas'); // Get minimap canvas
    const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null; // Get minimap context
    const healthFill = document.getElementById('health-fill');
    const plasmaScoreDisplay = document.getElementById('plasma-score');
    const finalPlasmaScoreDisplay = document.getElementById('final-plasma-score');
    const weaponDisplay = document.getElementById('weapon-display');
    const rollIndicator = document.getElementById('roll-indicator'); // Get roll indicator element

    // --- Game State Variables ---
    let gameActive = false;
    let lastTime = 0;
    let player;
    let settlements = [];
    let projectiles = [];
    let items = []; // Array to hold spawned items
    let plasmaScore = 0;
    let worldWidth = 3000;
    let worldHeight = 3000;
    let camera = { x: 0, y: 0 };
    let mousePos = { x: 0, y: 0 };

    // --- Input State ---
    // Add interact key ('f' by default in Player class)
    const keys = { w: false, a: false, s: false, d: false, shift: false, e: false, space: false, f: false };

    // --- Assets ---
    const groundTile = new Image();
    groundTile.src = 'assets/ground/ground_tile_standard.png'; // Path relative to index.html
    let groundPattern = null; // Will be created once image loads

    groundTile.onload = () => {
        if (ctx) { // Ensure context exists
            groundPattern = ctx.createPattern(groundTile, 'repeat');
        }
    };
    groundTile.onerror = () => {
        console.error("Failed to load ground tile image.");
    };

    // --- Player Assets ---
    const playerImgStandard = new Image();
    playerImgStandard.src = 'assets/player/standard_player.png';
    playerImgStandard.onerror = () => console.error("Failed to load standard_player image.");

    const playerImgIdle2 = new Image();
    playerImgIdle2.src = 'assets/player/idle_down_2.png';
    playerImgIdle2.onerror = () => console.error("Failed to load idle_down_2 image.");

    // --- Game Initialization ---
    function initGame() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Set minimap canvas dimensions based on CSS (or fixed size)
        if (minimapCanvas) {
            minimapCanvas.width = 150; // Match CSS width
            minimapCanvas.height = 150; // Match CSS height
        }

        worldWidth = Math.max(3000, canvas.width * 3);
        worldHeight = Math.max(3000, canvas.height * 3);

        // Pass world dimensions and images to Player constructor
        player = new Player(
            new Vector2(worldWidth / 2, worldHeight / 2),
            worldWidth,
            worldHeight,
            playerImgStandard, // Pass standard image
            playerImgIdle2     // Pass idle frame 2 image
        );
        settlements = [];
        projectiles = [];
        items = []; // Clear items array on game start
        plasmaScore = 0;
        updateScoreDisplay(); // Update display initially

        // Spawn the single initial settlement
        settlements = []; // Ensure it's empty before spawning
        spawnSettlement();

        if (settlements.length === 0) {
             console.error("Failed to spawn initial settlement. Game cannot start.");
             // Optionally show an error message to the user
             showScreen(menuScreen); // Go back to menu
             return;
        }


        gameActive = true;
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }

    // --- Settlement Spawning (Now only spawns one) ---
    function spawnSettlement() {
        // Simplified: Place the single settlement somewhat centrally but with some randomness
        const placementMargin = 500; // Margin from world edges
        const position = new Vector2(
             placementMargin + Math.random() * (worldWidth - placementMargin * 2),
             placementMargin + Math.random() * (worldHeight - placementMargin * 2)
        );
        const radius = 300; // Fixed radius, less meaningful now but kept for structure
        const numHumans = 10; // Fixed number of humans for the single large building

        // Get existing buildings (will be empty on first call)
        const existingBuildings = settlements.flatMap(s => s.buildings);

        // Pass world dimensions and necessary callbacks to Settlement constructor
        // Removed type, pass empty array for existingBuildings initially
        const newSettlement = new Settlement(
            position,
            radius,
            numHumans,
            worldWidth,
            worldHeight,
            () => { console.log("Settlement cleared!"); /* No respawn needed for single settlement */ },
            updateScore, // Callback to update score
            existingBuildings // Pass buildings from previous settlements (if any)
        );

        // Only add if the settlement constructor didn't fail (e.g., due to placement issues)
        if (!newSettlement.cleared) {
             settlements.push(newSettlement);
        } else {
             console.error("Settlement constructor indicated failure, not adding to game.");
        }
    }

    // isPositionTooClose is no longer needed as overlap is handled in Settlement constructor

    // --- Score Management ---
    function updateScore(amount) {
        plasmaScore += amount;
        updateScoreDisplay();
    }

    function updateScoreDisplay() {
        plasmaScoreDisplay.textContent = `Plasma: ${plasmaScore}`;
    }

    // --- Game Loop ---
    function gameLoop(timestamp) {
        if (!gameActive) return;

        const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.05); // Limit max delta time
        lastTime = timestamp;

        // --- Update ---
        // Pass projectiles to player update
        player.update(deltaTime, keys, settlements, healthFill, weaponDisplay, projectiles);

        // Pass player, LoS func, and projectiles to settlement update
        settlements.forEach(settlement => settlement.update(deltaTime, player, isLineOfSightClear, projectiles)); // Already passing player here

        // Projectile update signature is correct
        projectiles.forEach(p => p.update(deltaTime, settlements, player, gameOver));
        projectiles = projectiles.filter(p => p.lifeTime > 0);

        // Update items (currently does nothing, but good practice)
        items.forEach(item => item.update(deltaTime));

        // Check for item pickup
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (player.position.distance(item.position) < player.size.x / 2 + item.pickupRadius) {
                if (item.itemType === 'Plasma') {
                    updateScore(item.quantity); // Update score for Plasma
                    console.log(`Picked up ${item.quantity} Plasma.`);
                    items.splice(i, 1); // Remove item from game world
                }
                // Add logic for other item types here if needed
            }
        }

        updateCamera();

        // --- Draw ---
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground(ctx, camera);

        // Pass player to settlement draw to handle inside/outside view
        settlements.forEach(settlement => settlement.draw(ctx, camera, player)); // Already passing player here

        // Draw projectiles
        projectiles.forEach(p => p.draw(ctx, camera));

        // Draw items
        items.forEach(item => item.draw(ctx, camera));

        player.draw(ctx, camera);

        // Update HUD elements (including dash indicator)
        updateHUD();

        // Draw the minimap
        drawMinimap();

        requestAnimationFrame(gameLoop); // Continue the loop
    }


    // --- Camera and Background ---
    function updateCamera() {
        camera.x = player.position.x - canvas.width / 2;
        camera.y = player.position.y - canvas.height / 2;
        // Clamp camera to world bounds
        camera.x = Math.max(0, Math.min(worldWidth - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(worldHeight - canvas.height, camera.y));
    }

    // Removed time parameter from drawBackground definition
    function drawBackground(ctx, camera) {
        // Draw tiled ground first
        if (groundPattern) {
            ctx.save(); // Save context state
            ctx.fillStyle = groundPattern;
            // Translate the pattern origin based on camera position for seamless tiling
            ctx.translate(-camera.x % groundTile.width, -camera.y % groundTile.height);
            // Fill the entire canvas area, extending slightly beyond to ensure coverage during movement
            ctx.fillRect(
                (camera.x % groundTile.width) - groundTile.width,
                (camera.y % groundTile.height) - groundTile.height,
                canvas.width + groundTile.width * 2,
                canvas.height + groundTile.height * 2
            );
            ctx.restore(); // Restore context state
        } else {
            // Fallback solid color if pattern not ready
            ctx.fillStyle = '#4d1a00'; // Dark reddish-brown
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }


        // Draw stars over the ground
        ctx.fillStyle = 'rgba(255, 255, 200, 0.6)'; // Pale yellow stars
        const starCount = 150; // Adjust density as needed
        // Use a simple pseudo-random distribution based on index for consistency
        for(let i=0; i<starCount; i++) {
             const seed = i * 137; // Simple seeding
             // Use modulo to wrap stars within world bounds
             const starX = ((seed * 17) % worldWidth);
             const starY = ((seed * 29) % worldHeight);

             // Calculate screen position
             const screenX = starX - camera.x;
             const screenY = starY - camera.y;

             // Only draw stars visible on screen (with a small buffer)
             if (screenX > -10 && screenX < canvas.width + 10 && screenY > -10 && screenY < canvas.height + 10) {
                  ctx.fillRect(screenX, screenY, 2, 2); // Small square stars
             }
        }

        // Removed call to drawDustClouds
    }

    // Removed drawDustClouds function definition

    // --- Minimap Drawing ---
    function drawMinimap() {
        if (!minimapCtx || !player) return; // Ensure context and player exist

        const mapWidth = minimapCanvas.width;
        const mapHeight = minimapCanvas.height;
        const scaleX = mapWidth / worldWidth;
        const scaleY = mapHeight / worldHeight;

        // Clear minimap
        minimapCtx.fillStyle = 'rgba(10, 10, 10, 0.8)'; // Dark background
        minimapCtx.fillRect(0, 0, mapWidth, mapHeight);

        // Draw settlements (buildings)
        minimapCtx.fillStyle = '#888888'; // Grey for buildings
        settlements.forEach(settlement => {
            settlement.buildings.forEach(building => {
                const mapX = building.position.x * scaleX;
                const mapY = building.position.y * scaleY;
                const mapW = building.size.x * scaleX; // Use building.size.x
                const mapH = building.size.y * scaleY; // Use building.size.y
                minimapCtx.fillRect(mapX, mapY, Math.max(1, mapW), Math.max(1, mapH)); // Ensure at least 1px size
            });
        });

        // Draw player
        minimapCtx.fillStyle = '#ff3a3a'; // Red for player (matches health bar)
        const playerMapX = player.position.x * scaleX;
        const playerMapY = player.position.y * scaleY;
        minimapCtx.beginPath();
        minimapCtx.arc(playerMapX, playerMapY, 3, 0, Math.PI * 2); // Draw a small circle for the player
        minimapCtx.fill();

        // Optional: Draw camera view rectangle (can be complex, skip for now)
    }


    // --- HUD Update ---
    function updateHUD() {
        // Update roll indicator based on cooldown
        if (player && rollIndicator) {
            if (player.dashCooldownTimer <= 0) { // Use dashCooldownTimer (assuming cooldown logic remains the same)
                rollIndicator.classList.add('ready');
                rollIndicator.classList.remove('cooldown');
                rollIndicator.textContent = 'ROLL READY'; // Update text
            } else {
                rollIndicator.classList.add('cooldown');
                rollIndicator.classList.remove('ready');
                // Display remaining cooldown time (optional)
                rollIndicator.textContent = `ROLL (${player.dashCooldownTimer.toFixed(1)}s)`; // Update text and use dashCooldownTimer
            }
        }
        // Health and weapon are updated within Player.update, score updated via callback
    }

    // --- Screen Management ---
    function showScreen(screen) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    function startGame() {
        showScreen(gameScreen);
        initGame();
    }

    function gameOver() {
        gameActive = false;
        finalPlasmaScoreDisplay.textContent = plasmaScore; // Show final score
        showScreen(gameOverScreen);
    }

    // --- Event Listeners ---
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (gameActive && player) { // Only process keys if game is active
            if (e.key === ' ') { // Handle space specifically
                keys.space = true;
            } else if (key === player.interactKey) { // Use player's interact key
                keys[key] = true;
                handleInteraction(); // Call interaction logic on key down
            } else if (key in keys) { // Handle other tracked keys (w,a,s,d,shift,e)
                keys[key] = true;
            }
        }
    });
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (gameActive && player) { // Only process keys if game is active
            if (e.key === ' ') { // Handle space specifically
                keys.space = false;
            } else if (key === player.interactKey) {
                 keys[key] = false; // Reset interaction key state on key up
            } else if (key in keys) { // Handle other tracked keys
                keys[key] = false;
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mousePos.x = e.clientX - rect.left;
        mousePos.y = e.clientY - rect.top;
    });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left click
            // mouseClick = true; // State not strictly needed here
            if (gameActive && player) {
                 // Pass necessary dependencies to player attack
                 player.attack(mousePos, camera, projectiles, settlements);
            }
        }
    });

    // canvas.addEventListener('mouseup', (e) => {
    //     if (e.button === 0) {
    //         mouseClick = false;
    //     }
    // }); // Not strictly needed if attack triggers on mousedown

    canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // Camera update will handle adjustment in the next frame
    });

    // --- Initial Setup ---
    startButton.addEventListener('click', startGame);
    retryButton.addEventListener('click', startGame);

        // Show the menu screen initially (optional, could be handled by CSS)
        // showScreen(menuScreen);

    // --- Interaction Handling ---
    function handleInteraction() {
        if (!gameActive || !player || !player.settlement) return; // Ensure player is in a settlement

        const interactionReach = 60; // Increased reach slightly
        let closestInteractable = null;
        let minDistanceSq = interactionReach * interactionReach;

        const currentSettlement = player.settlement; // Use the settlement the player is currently in

        // Find the closest door AND closest chest within reach independently
        const closestDoor = currentSettlement.findClosestDoor(player.position, interactionReach);
        const closestChest = currentSettlement.findClosestChest(player.position, interactionReach);

        let doorDistSq = Infinity;
        let chestDistSq = Infinity;

        if (closestDoor) {
            doorDistSq = player.position.distanceSq(closestDoor.position);
        }
        if (closestChest) {
            chestDistSq = player.position.distanceSq(closestChest.position);
        }

        // Determine which one is actually closer
        if (doorDistSq < chestDistSq && doorDistSq <= minDistanceSq) {
            closestInteractable = closestDoor;
        } else if (chestDistSq < doorDistSq && chestDistSq <= minDistanceSq) {
            closestInteractable = closestChest;
        } else {
            closestInteractable = null; // Neither is close enough or exists
        }

        // Perform interaction if a target was found
        if (closestInteractable) {
            const interactionResult = closestInteractable.interact(player); // Call interact on the specific entity

            if (closestInteractable instanceof Chest && interactionResult && interactionResult.itemSpawned) {
                // Chest interaction resulted in spawning an item
                const details = interactionResult.itemSpawned;
                const newItem = new Item(details.position, details.type, details.quantity);
                items.push(newItem); // Add the spawned item to the game world
                console.log(`Chest opened, spawned ${details.quantity} ${details.type}`);
            } else if (closestInteractable instanceof Door) {
                console.log("Toggled door.");
                // No further action needed here, door state changed internally
            } else if (closestInteractable instanceof Chest) {
                 console.log("Chest opened (empty or already open).");
            }
        }
    }
});
