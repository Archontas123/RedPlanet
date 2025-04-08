import { Vector2 } from '../math/Vector2.js';
import { perlin } from '../math/PerlinNoise.js';
import { TILE_SIZE } from './constants.js'; 

const TILE_EMPTY = 0;
const TILE_STONE = 1;
const TILE_IRON = 2;
const TILE_COPPER = 3;
const TILE_TITANIUM = 4;
const TILE_PLASMA = 5;

export class CaveSystem {
    constructor(caveId, entrancePosition) {
        this.caveId = caveId;
        this.entrancePosition = entrancePosition.clone(); 
        
        this.tileSize = TILE_SIZE; 
        this.gridWidth = 60; 
        this.gridHeight = 40; 
        this.width = this.gridWidth * this.tileSize;
        this.height = this.gridHeight * this.tileSize;

        this.position = new Vector2(
            entrancePosition.x - this.width / 2,
            entrancePosition.y - this.height / 2 
        );
        
        this.exitPosition = new Vector2(
            this.position.x + this.width / 2, 
            this.position.y + this.height - this.tileSize * 2 
        ); 

        this.tiles = []; 
        this.otherEntities = []; 

        this.generateCaveLayout();
    }

    generateCaveLayout() {
        this.initializeTiles();
        this.carveCaves();
        this.placeOres();
        // Ensure entrance/exit are clear
        this.clearEntranceExit(); 
    }

    initializeTiles() {
        this.tiles = Array(this.gridHeight).fill(null).map(() => Array(this.gridWidth).fill(TILE_STONE));
    }

    carveCaves() {
        const noiseScale = 0.1; 
        const threshold = 0.45; 
        const seed = this.caveId * 100; 

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const noiseValue = perlin.noise(
                    (x + seed) * noiseScale, 
                    (y + seed) * noiseScale, 
                    seed * 0.1 
                );
                
                if (noiseValue < threshold) {
                    this.tiles[y][x] = TILE_EMPTY;
                }
            }
        }
        
        // Optional: Cellular automata smoothing can be added here
    }

    placeOres() {
        const seed = this.caveId * 54321;
        const seededRandom = (n) => {
            return ((Math.sin(n) * 10000) % 1 + 1) % 1;
        };

        const oreTypes = [
            { type: TILE_IRON, stoneChance: 0.02, emptyChance: 0.05 },
            { type: TILE_COPPER, stoneChance: 0.01, emptyChance: 0.03 },
            { type: TILE_TITANIUM, stoneChance: 0.005, emptyChance: 0.015 },
            { type: TILE_PLASMA, stoneChance: 0.001, emptyChance: 0.005 },
        ];

        for (let y = 1; y < this.gridHeight - 1; y++) {
            for (let x = 1; x < this.gridWidth - 1; x++) {
                const currentTile = this.tiles[y][x];
                let randomValue = seededRandom(seed + x * 100 + y);

                for (const ore of oreTypes) {
                    const chance = (currentTile === TILE_STONE) ? ore.stoneChance : 
                                   (currentTile === TILE_EMPTY) ? ore.emptyChance : 0;
                    
                    if (randomValue < chance) {
                        this.tiles[y][x] = ore.type;
                        break; 
                    }
                    randomValue -= chance; // Adjust random value for next ore check
                }
            }
        }
    }
    
    clearEntranceExit() {
        // Convert world entrance/exit positions to grid coordinates
        const entranceGridX = Math.floor((this.entrancePosition.x - this.position.x) / this.tileSize);
        const entranceGridY = Math.floor((this.entrancePosition.y - this.position.y) / this.tileSize);
        const exitGridX = Math.floor((this.exitPosition.x - this.position.x) / this.tileSize);
        const exitGridY = Math.floor((this.exitPosition.y - this.position.y) / this.tileSize);

        // Clear a small area around entrance and exit
        const clearRadius = 2;
        for (let dy = -clearRadius; dy <= clearRadius; dy++) {
            for (let dx = -clearRadius; dx <= clearRadius; dx++) {
                // Clear around entrance
                const ey = entranceGridY + dy;
                const ex = entranceGridX + dx;
                if (ey >= 0 && ey < this.gridHeight && ex >= 0 && ex < this.gridWidth) {
                     if (Math.sqrt(dx*dx + dy*dy) <= clearRadius) {
                        this.tiles[ey][ex] = TILE_EMPTY;
                     }
                }
                // Clear around exit
                const wy = exitGridY + dy;
                const wx = exitGridX + dx;
                 if (wy >= 0 && wy < this.gridHeight && wx >= 0 && wx < this.gridWidth) {
                     if (Math.sqrt(dx*dx + dy*dy) <= clearRadius) {
                        this.tiles[wy][wx] = TILE_EMPTY;
                     }
                }
            }
        }
         // Ensure the exact exit tile is clear
        if (exitGridY >= 0 && exitGridY < this.gridHeight && exitGridX >= 0 && exitGridX < this.gridWidth) {
            this.tiles[exitGridY][exitGridX] = TILE_EMPTY;
        }
    }


    getTileAt(worldX, worldY) {
        const gridX = Math.floor((worldX - this.position.x) / this.tileSize);
        const gridY = Math.floor((worldY - this.position.y) / this.tileSize);

        if (gridX < 0 || gridX >= this.gridWidth || gridY < 0 || gridY >= this.gridHeight) {
            return null; // Outside cave bounds
        }
        return this.tiles[gridY][gridX];
    }

    isSolid(tileType) {
        return tileType === TILE_STONE; // Only stone is solid for now
    }

    getAllEntities() {
        // For now, no entities are generated directly by the cave system itself
        // MineralDeposits might be created dynamically when mining ore tiles later
        return [...this.otherEntities]; 
    }

    getAllObstacles() {
        // Obstacles are now derived from the tile grid (stone tiles)
        // This needs integration with the collision system, which might expect Wall objects.
        // For now, return an empty array, collision needs to check tiles directly.
        return []; 
    }

    draw(ctx, camera) {
        const startX = Math.max(0, Math.floor((camera.x - this.position.x - camera.width / 2 / camera.zoom) / this.tileSize));
        const startY = Math.max(0, Math.floor((camera.y - this.position.y - camera.height / 2 / camera.zoom) / this.tileSize));
        const endX = Math.min(this.gridWidth, Math.ceil((camera.x - this.position.x + camera.width / 2 / camera.zoom) / this.tileSize));
        const endY = Math.min(this.gridHeight, Math.ceil((camera.y - this.position.y + camera.height / 2 / camera.zoom) / this.tileSize));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tileType = this.tiles[y][x];
                const worldX = this.position.x + x * this.tileSize;
                const worldY = this.position.y + y * this.tileSize;

                let color;
                switch (tileType) {
                    case TILE_EMPTY: color = '#303030'; break; // Dark grey floor
                    case TILE_STONE: color = '#606060'; break; // Grey stone
                    case TILE_IRON: color = '#a05a2c'; break; // Brownish iron
                    case TILE_COPPER: color = '#b87333'; break; // Orangey copper
                    case TILE_TITANIUM: color = '#c0c0c0'; break; // Silvery titanium
                    case TILE_PLASMA: color = '#00ffff'; break; // Cyan plasma
                    default: color = '#ff00ff'; // Magenta for errors
                }

                ctx.fillStyle = color;
                ctx.fillRect(worldX, worldY, this.tileSize, this.tileSize);
            }
        }

        // Draw exit indicator (simplified)
        const exitWorldX = this.position.x + this.gridWidth / 2 * this.tileSize; // Center bottom area
        const exitWorldY = this.position.y + (this.gridHeight - 1) * this.tileSize; 
        
        ctx.fillStyle = '#4d3319'; 
        ctx.fillRect(exitWorldX - this.tileSize * 1.5, exitWorldY, this.tileSize * 3, this.tileSize); 

        ctx.fillStyle = '#ffffff';
        ctx.font = `${16 / camera.zoom}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.fillText('EXIT', exitWorldX, exitWorldY + this.tileSize * 0.75);
        ctx.textAlign = 'left';
    }

    isNearExit(playerPosition, radius = 50) {
         // Check proximity to the designated exit area tiles
        const exitWorldX = this.position.x + this.gridWidth / 2 * this.tileSize; 
        const exitWorldY = this.position.y + (this.gridHeight - 1) * this.tileSize;
        const exitCenter = new Vector2(exitWorldX, exitWorldY + this.tileSize / 2);
        return playerPosition.distance(exitCenter) < radius;
    }
}
