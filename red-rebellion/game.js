import { Vector2, lineIntersectsRect } from './utils.js';
import { Player, Projectile, isLineOfSightClear } from './entities.js';
import { Settlement } from './settlement.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const startButton = document.getElementById('start-button');
    const retryButton = document.getElementById('retry-button');
    const menuScreen = document.getElementById('menu-screen');
    const gameScreen = document.getElementById('game-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const healthFill = document.getElementById('health-fill');
    const plasmaScoreDisplay = document.getElementById('plasma-score');
    const finalPlasmaScoreDisplay = document.getElementById('final-plasma-score');
    const weaponDisplay = document.getElementById('weapon-display');

    // --- Game State Variables ---
    let gameActive = false;
    let lastTime = 0;
    let player;
    let settlements = [];
    let projectiles = [];
    let plasmaScore = 0;
    let worldWidth = 3000;
    let worldHeight = 3000;
    let camera = { x: 0, y: 0 };
    let mousePos = { x: 0, y: 0 };
    // let mouseClick = false; // mouseClick state is handled directly in event listener

    // --- Input State ---
    const keys = { w: false, a: false, s: false, d: false, shift: false, e: false };

    // --- Game Initialization ---
    function initGame() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        worldWidth = Math.max(3000, canvas.width * 3);
        worldHeight = Math.max(3000, canvas.height * 3);

        // Pass world dimensions to Player constructor
        player = new Player(new Vector2(worldWidth / 2, worldHeight / 2), worldWidth, worldHeight);
        settlements = [];
        projectiles = [];
        plasmaScore = 0;
        updateScoreDisplay(); // Update display initially

        // Spawn initial settlements
        for (let i = 0; i < 8; i++) {
            spawnSettlement();
        }

        gameActive = true;
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }

    // --- Settlement Spawning ---
    function spawnSettlement() {
        const minRadius = 120, maxRadius = 250;
        const radius = Math.random() * (maxRadius - minRadius) + minRadius;
        const numHumans = Math.floor(radius / 75) + (Math.random() > 0.5 ? 3 : 2);
        let position;
        let attempts = 0;
        const maxAttempts = 20;

        do {
            position = new Vector2(
                Math.random() * (worldWidth - radius * 2) + radius,
                Math.random() * (worldHeight - radius * 2) + radius
            );
            attempts++;
            if (attempts > maxAttempts) {
                 console.warn("Could not find suitable position for new settlement after", maxAttempts, "attempts.");
                 return; // Stop if no position found
            }
        } while (isPositionTooClose(position, radius));

        // Pass world dimensions and necessary callbacks to Settlement constructor
        settlements.push(new Settlement(
            position,
            radius,
            numHumans,
            worldWidth,
            worldHeight,
            spawnSettlement, // Callback for when cleared
            updateScore // Callback to update score
        ));
    }

    function isPositionTooClose(position, radius) {
         // Check distance from player
         if (player && position.distance(player.position) < 500) return true;
         // Check distance from existing, uncleared settlements
         for (const s of settlements) {
              if (!s.cleared && position.distance(s.position) < s.radius + radius + 200) {
                   return true; // Too close to another settlement
              }
         }
         return false; // Position is okay
    }

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
        // Pass necessary dependencies to player update
        player.update(deltaTime, keys, settlements, healthFill, weaponDisplay);
 
        // Pass necessary dependencies to settlement update (which passes them to human update)
        settlements.forEach(settlement => settlement.update(deltaTime, player, isLineOfSightClear, projectiles)); // Pass projectiles
 
        // Pass necessary dependencies to projectile update
        projectiles.forEach(p => p.update(deltaTime, settlements, player, gameOver)); // Pass gameOver callback
        projectiles = projectiles.filter(p => p.lifeTime > 0); // Remove dead projectiles
 
        updateCamera();

        // --- Draw ---
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground(ctx, camera);

        // Draw settlements (which draw their obstacles and humans)
        settlements.forEach(settlement => settlement.draw(ctx, camera));

        // Draw projectiles
        projectiles.forEach(p => p.draw(ctx, camera));

        // Draw player
        player.draw(ctx, camera);

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

    function drawBackground(ctx, camera) {
        // Fallback solid color
        ctx.fillStyle = '#4d1a00'; // Dark reddish-brown
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw stars
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
        if (key in keys) keys[key] = true;
    });
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) keys[key] = false;
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
});
