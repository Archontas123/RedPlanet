import { CHUNK_SIZE } from './constants.js';

export class Chunk {
    constructor(chunkX, chunkY) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.worldX = chunkX * CHUNK_SIZE;
        this.worldY = chunkY * CHUNK_SIZE;
        this.size = CHUNK_SIZE;
        this.entities = [];
        this.trees = [];
        this.decorations = []; // Add decorations array
        this.settlement = null;
        this.generated = false;
        this.lastAccessTime = performance.now();
    }

    contains(worldPos) {
        return worldPos.x >= this.worldX && worldPos.x < this.worldX + this.size &&
               worldPos.y >= this.worldY && worldPos.y < this.worldY + this.size;
    }

    drawBounds(ctx, camera) {
        const screenX = this.worldX - camera.x;
        const screenY = this.worldY - camera.y;
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX, screenY, this.size, this.size);
        ctx.fillStyle = 'yellow';
        ctx.font = '10px Arial';
        ctx.fillText(`(${this.chunkX}, ${this.chunkY})`, screenX + 5, screenY + 15);
    }
}
