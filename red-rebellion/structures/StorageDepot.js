import { Vector2 } from '../math/Vector2.js';

export class StorageDepot {
    constructor(position, size) {
        this.position = position;
        this.size = size;
        this.isInteractable = true;
        this.interactionRadius = 60;
        this.type = 'StorageDepot';
    }

    interact(player, playerSettlement, game) {
        console.log("Interacting with Storage Depot - Requesting GUI toggle");
        // Signal the game to toggle the GUI for this depot
        // The actual opening/closing and resource transfer will be handled in game.js
        game.toggleDepotGui(this);
        return true; // Indicate successful interaction request
    }

    draw(ctx, camera) {
        // Use world coordinates directly
        const worldX = this.position.x;
        const worldY = this.position.y;

        // Draw base rect at world coords
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(worldX - this.size.x / 2, worldY - this.size.y / 2, this.size.x, this.size.y);
        // Draw border, scaling line width
        ctx.strokeStyle = '#5a2d0c';
        ctx.lineWidth = 2 / camera.zoom; // Scale line width
        ctx.strokeRect(worldX - this.size.x / 2, worldY - this.size.y / 2, this.size.x, this.size.y);

        // Draw text label, scaling font size and offset
        const fontSize = 10 / camera.zoom;
        const yOffset = 4 / camera.zoom;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontSize}px Arial`;
         ctx.textAlign = 'center';
         ctx.fillText('Depot', worldX, worldY + yOffset);
         ctx.textAlign = 'left'; // Reset alignment
     }

     // Get the Y coordinate for depth sorting (bottom of the structure)
     getSortY() {
         // Drawing is centered vertically
         // Subtract epsilon for sort stability against player
         return this.position.y + this.size.y / 2 - 0.01;
     }
 }
