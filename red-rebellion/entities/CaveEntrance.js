import { Entity } from './Entity.js';
import { Vector2 } from '../utils.js';

export class CaveEntrance extends Entity {
    constructor(position) {
        // Create a relatively small hitbox for the cave entrance
        super(position, new Vector2(50, 30), '#4d3319');
        this.isInteractable = true;
        this.isCaveEntrance = true;
        this.visualSize = new Vector2(80, 60); // Larger visual size
        this.interactionRadius = 70;
        this.type = 'CaveEntrance';
        
        // Each cave entrance gets a unique ID to link to its cave system
        this.caveId = Math.floor(Math.random() * 1000000);
    }

    interact(player, game) {
        console.log(`Player entering cave system ${this.caveId}`);
        
        // Tell the game to transition to this cave
        if (game && typeof game.enterCave === 'function') {
            game.enterCave(this.caveId, player);
            return { type: 'cave_entrance', caveId: this.caveId };
        }
        
        return false;
    }

    draw(ctx, camera) {
        // Draw the cave entrance (a simple arch for now)
        const worldX = this.position.x;
        const worldY = this.position.y;
        
        // Draw a semi-elliptical cave entrance
        ctx.fillStyle = '#000000'; // Black for the cave interior
        ctx.beginPath();
        ctx.ellipse(
            worldX, 
            worldY, 
            this.visualSize.x / 2,
            this.visualSize.y / 2,
            0, 
            Math.PI, 
            0, 
            false
        );
        ctx.fill();
        
        // Draw some rocky surroundings
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(
            worldX,
            worldY - this.visualSize.y / 4,
            this.visualSize.x / 2 + 10,
            this.visualSize.y / 4,
            0,
            Math.PI,
            0,
            false
        );
        ctx.fill();
        
        // Draw some rocky details
        ctx.strokeStyle = '#2d1f0f';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.beginPath();
        ctx.ellipse(
            worldX,
            worldY,
            this.visualSize.x / 2,
            this.visualSize.y / 2,
            0,
            Math.PI,
            0,
            false
        );
        ctx.stroke();
    }

    // Override getRectData to use the visual size for collisions
    getRectData() {
        return {
            x: this.position.x,
            y: this.position.y,
            width: this.size.x,
            height: this.size.y
        };
    }
    
    getSortY() {
        // Position at the bottom of the visual representation
        return this.position.y + this.visualSize.y / 2 - 0.01;
    }
}