import { Vector2 } from '../math/Vector2.js';
import { Settlement } from '../settlement.js';
import { Tree } from '../entities/Tree.js';
import { Plant } from '../entities/Plant.js';
import { perlin } from '../math/PerlinNoise.js';
import { Chunk } from './Chunk.js';
import { CHUNK_SIZE, LOAD_RADIUS } from './constants.js';

export class WorldManager {
    constructor(updateScoreCallback) {
        this.chunks = new Map();
        this.activeSettlements = [];
        this.updateScore = updateScoreCallback;
        this.worldSeed = Math.random();
        this.biomeScale = 0.0008; // Lower scale = larger biomes
        this.forestThreshold = 0.68; // Higher threshold = rarer forests
        this.settlementExclusionRadiusSq = (CHUNK_SIZE * 1.5) * (CHUNK_SIZE * 1.5); // Prevent forests too close to settlements
        this.startExclusionRadius = 1; // Exclude starting chunk and immediate neighbors (radius 1)
    }

    getChunkCoords(worldX, worldY) {
        const chunkX = Math.floor(worldX / CHUNK_SIZE);
        const chunkY = Math.floor(worldY / CHUNK_SIZE);
        return { chunkX, chunkY };
    }

    getChunkKey(chunkX, chunkY) {
        return `${chunkX},${chunkY}`;
    }

    getChunk(chunkX, chunkY) {
        const key = this.getChunkKey(chunkX, chunkY);
        if (!this.chunks.has(key)) {
            const newChunk = new Chunk(chunkX, chunkY);
            this.chunks.set(key, newChunk);
            this.generateChunkContent(newChunk);
        }
        const chunk = this.chunks.get(key);
        chunk.lastAccessTime = performance.now();
        return chunk;
    }

    generateChunkContent(chunk) {
        if (chunk.generated) return;

        const seed = this.simpleHash(chunk.chunkX, chunk.chunkY, this.worldSeed);
        const randomValue = this.seededRandom(seed);
        const settlementProbability = 0.05;

        if (randomValue < settlementProbability) {
            const margin = 100;
            const settlementX = chunk.worldX + margin + this.seededRandom(seed * 17) * (CHUNK_SIZE - margin * 2);
            const settlementY = chunk.worldY + margin + this.seededRandom(seed * 29) * (CHUNK_SIZE - margin * 2);
            const position = new Vector2(settlementX, settlementY);
            const radius = 300;
            const numHumans = 10;

            const newSettlement = new Settlement(
                position,
                radius,
                numHumans,
                () => { console.log("Settlement cleared!"); },
                this.updateScore,
                []
            );

            if (!newSettlement.cleared) {
                chunk.surfaceLayer.settlement = newSettlement; // Modified
                this.activeSettlements.push(newSettlement);
                console.log(`Generated settlement in chunk (${chunk.chunkX}, ${chunk.chunkY}) at ${position.x.toFixed(0)}, ${position.y.toFixed(0)}`);
            } else {
                console.warn(`Settlement generation failed in chunk (${chunk.chunkX}, ${chunk.chunkY}), possibly due to overlap.`);
            }
        }

        // --- Tree Generation ---
        // Check 1: Don't generate trees in the starting area chunks
        const distFromStartSq = chunk.chunkX * chunk.chunkX + chunk.chunkY * chunk.chunkY;
        if (distFromStartSq <= this.startExclusionRadius * this.startExclusionRadius) {
             chunk.surfaceLayer.trees = []; // Modified
             chunk.generated = true; // Mark as generated even if no trees/settlement
             return; // Skip tree generation for start area
        }

        // Check 2: Don't generate trees if a settlement exists in this chunk
        if (chunk.surfaceLayer.settlement) { // Modified
            chunk.surfaceLayer.trees = []; // Modified
            chunk.generated = true; // Mark as generated
            return; // Skip tree generation for settlement chunks
        }

        // Proceed with tree generation only if checks pass
        const treeDensityInForest = 0.0015; // Higher density inside forests
        const attemptsPerChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * treeDensityInForest * 2); // Try more positions
        chunk.surfaceLayer.trees = []; // Initialize trees array for the chunk - Modified
        let treesSpawned = 0;

        for (let i = 0; i < attemptsPerChunk; i++) {
            const potentialX = chunk.worldX + this.seededRandom(seed + i * 3) * CHUNK_SIZE;
            const potentialY = chunk.worldY + this.seededRandom(seed + i * 5) * CHUNK_SIZE;
            const treePos = new Vector2(potentialX, potentialY);

            // Check biome noise using the imported perlin object
            const noiseValue = (perlin.noise(potentialX * this.biomeScale, potentialY * this.biomeScale, 0) + 1) / 2; // Normalize to 0-1

            if (noiseValue >= this.forestThreshold) {
                // Check if inside a building
                let canSpawn = true;
                if (chunk.surfaceLayer.settlement) { // Modified
                    for (const building of chunk.surfaceLayer.settlement.buildings) { // Modified
                        if (building.containsPointFootprint(treePos)) {
                            canSpawn = false;
                            break;
                        }
                    }
                }

                // Basic check to avoid trees too close to each other
                let tooClose = false;
                const minTreeDistSq = 40 * 40; // Minimum squared distance between trees
                for(const existingTree of chunk.surfaceLayer.trees) { // Modified
                    if (treePos.distanceSq(existingTree.position) < minTreeDistSq) {
                        tooClose = true;
                        break;
                    }
                }

                if (canSpawn && !tooClose) {
                    chunk.surfaceLayer.trees.push(new Tree(treePos)); // Modified
                    treesSpawned++;
                }
            }
        }
        if (treesSpawned > 0) {
            console.log(`Generated ${treesSpawned} trees in forest zone of chunk (${chunk.chunkX}, ${chunk.chunkY})`);
        }

        // --- Generate Decorative Plants ---
        const PLANT_CHANCE = 1 / 50;
        const TILE_SIZE = 32; // Assumed tile size for grid iteration

        chunk.surfaceLayer.decorations = chunk.surfaceLayer.decorations || []; // Initialize if needed - Modified
        let plantsSpawned = 0; // Keep track for logging
        const gridCols = Math.floor(CHUNK_SIZE / TILE_SIZE);
        const gridRows = Math.floor(CHUNK_SIZE / TILE_SIZE);

        // Use a separate seed stream for plant placement consistency
        let plantSeed = this.simpleHash(chunk.chunkX, chunk.chunkY, this.worldSeed + 1); // Offset seed from tree/settlement gen

        for (let gridY = 0; gridY < gridRows; gridY++) {
            for (let gridX = 0; gridX < gridCols; gridX++) {
                // Calculate center of the current tile
                const potentialX = chunk.worldX + gridX * TILE_SIZE + TILE_SIZE / 2;
                const potentialY = chunk.worldY + gridY * TILE_SIZE + TILE_SIZE / 2;
                const plantPos = new Vector2(potentialX, potentialY);

                // Use a unique seed for each tile's random check based on world coords
                const tileSeed = this.simpleHash(Math.floor(potentialX), Math.floor(potentialY), plantSeed);
                const randomCheck = this.seededRandom(tileSeed);

                // Simple chance check
                if (randomCheck < PLANT_CHANCE) {
                    chunk.surfaceLayer.decorations.push(new Plant(plantPos)); // Modified
                    plantsSpawned++;
                    // Perturb seed slightly after spawn
                    plantSeed = this.simpleHash(plantsSpawned, Math.floor(potentialX) * Math.floor(potentialY), plantSeed);
                }
            }
        }

        if (plantsSpawned > 0) {
            console.log(`Generated ${plantsSpawned} plants in chunk (${chunk.chunkX}, ${chunk.chunkY}) with simple 1/50 chance.`);
        }

        chunk.generated = true;
    }

    updateActiveChunks(playerWorldX, playerWorldY) {
        const { chunkX: playerChunkX, chunkY: playerChunkY } = this.getChunkCoords(playerWorldX, playerWorldY);
        const newlyLoadedChunks = [];
        const currentActiveChunks = new Set();

        for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
            for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
                const targetChunkX = playerChunkX + dx;
                const targetChunkY = playerChunkY + dy;
                const key = this.getChunkKey(targetChunkX, targetChunkY);
                currentActiveChunks.add(key);

                if (!this.chunks.has(key)) {
                    const newChunk = this.getChunk(targetChunkX, targetChunkY);
                    newlyLoadedChunks.push(newChunk);
                } else {
                    this.chunks.get(key).lastAccessTime = performance.now();
                }
            }
        }

        const unloadThreshold = 30000;
        const now = performance.now();
        const chunksToRemove = [];
        for (const [key, chunk] of this.chunks.entries()) {
            if (!currentActiveChunks.has(key) && (now - chunk.lastAccessTime > unloadThreshold)) {
                 chunksToRemove.push(key);
                 if (chunk.surfaceLayer.settlement) { // Modified
                     const index = this.activeSettlements.indexOf(chunk.surfaceLayer.settlement); // Modified
                     if (index > -1) {
                         this.activeSettlements.splice(index, 1);
                         console.log(`Unloading settlement from chunk (${chunk.chunkX}, ${chunk.chunkY})`);
                     }
                 }
            }
        }

        chunksToRemove.forEach(key => {
            this.chunks.delete(key);
        });

        return this.getActiveChunks();
    }

    getActiveChunks() {
        return Array.from(this.chunks.values());
    }

    // --- Getters for Active Entities (Surface Layer Only for now) ---
    getActiveSettlements() {
        return this.getActiveChunks().map(chunk => chunk.surfaceLayer.settlement).filter(settlement => !!settlement); // Modified
    }

    getActiveTrees() {
        let allTrees = [];
        this.getActiveChunks().forEach(chunk => {
            if (chunk.surfaceLayer.trees) { // Modified
                allTrees = allTrees.concat(chunk.surfaceLayer.trees); // Modified
            }
        });
        return allTrees;
    }

    getActiveDecorations() {
        let allDecorations = [];
        this.getActiveChunks().forEach(chunk => {
            if (chunk.surfaceLayer.decorations) { // Modified
                allDecorations = allDecorations.concat(chunk.surfaceLayer.decorations); // Modified
            }
        });
        return allDecorations;
    }
    // TODO: Add getters for underground entities when needed

    simpleHash(x, y, seed) {
        let h = seed;
        h = Math.imul(h ^ x, 2654435761);
        h = Math.imul(h ^ y, 2654435761);
        h = h ^ (h >>> 16);
        h = Math.imul(h, 2246822507);
        h = h ^ (h >>> 13);
        h = Math.imul(h, 3266489909);
        h = h ^ (h >>> 16);
        return h;
    }

    seededRandom(seed) {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}
