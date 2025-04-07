import { Entity } from './Entity.js';
import { Vector2 } from '../utils.js';

export class Container extends Entity {
    constructor(position) {
        super(position, new Vector2(40, 30), '#708090');
        this.isInteractable = true;
        this.isContainer = true;
        this.opened = false;
    }

    interact(player) {
        if (!this.opened) {
            this.opened = true;
            this.isInteractable = false;
            this.color = '#5a6874';

            const drops = [];
            const numDrops = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < numDrops; i++) {
                drops.push({
                    type: Math.random() < 0.5 ? 'rock' : 'wood',
                    quantity: 1
                });
            }
            return drops;
        }
        return null;
    }

    draw(ctx, camera) {
        // Draw at world position
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2, // Removed - camera.x
            this.position.y - this.size.y / 2, // Removed - camera.y
            this.size.x,
            this.size.y
        );
        ctx.strokeStyle = '#404a54';
        ctx.lineWidth = 2 / camera.zoom; // Scale line width
        ctx.strokeRect(
            this.position.x - this.size.x / 2, // Removed - camera.x
            this.position.y - this.size.y / 2, // Removed - camera.y
            this.size.x,
            this.size.y
        );
    }

    update(deltaTime) { /* Containers don't update */ }
    takeDamage(amount, source = null, killContext = 'other') { return false; }
    getRectData() { return { x: this.position.x, y: this.position.y, width: this.size.x, height: this.size.y }; }
}
