import { Vector2 } from '../math/Vector2.js';
import { Settlement } from '../settlement.js';
import { Chunk } from './Chunk.js';
import { CHUNK_SIZE, LOAD_RADIUS } from './constants.js';

export class WorldManager {
    constructor(updateScoreCallback) {
        this.chunks = new Map();
        this.activeSettlements = [];
        this.updateScore = updateScoreCallback;
        this.worldSeed = Math.random();
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
                chunk.settlement = newSettlement;
                this.activeSettlements.push(newSettlement);
                console.log(`Generated settlement in chunk (${chunk.chunkX}, ${chunk.chunkY}) at ${position.x.toFixed(0)}, ${position.y.toFixed(0)}`);
            } else {
                console.warn(`Settlement generation failed in chunk (${chunk.chunkX}, ${chunk.chunkY}), possibly due to overlap.`);
            }
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
                 if (chunk.settlement) {
                     const index = this.activeSettlements.indexOf(chunk.settlement);
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

    getActiveSettlements() {
        return this.getActiveChunks().map(chunk => chunk.settlement).filter(settlement => settlement !== null);
    }

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
