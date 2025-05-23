import { Entity } from './Entity.js';
import { Vector2 } from '../utils.js';

export class Generator extends Entity {
    constructor(position) {
        super(position, new Vector2(35, 45), '#4682B4');
        this.isInteractable = true;
        this.isGenerator = true;
        this.used = false;
    }

    interact(player) {
        if (!this.used) {
            this.used = true;
            this.isInteractable = false;
            this.color = '#36648B';

            const plasmaAmount = 1;
            if ('plasma' in player.inventory) {
                player.inventory.plasma += plasmaAmount;
                console.log(`Siphoned ${plasmaAmount} plasma. New total: ${player.inventory.plasma}`);
            } else {
                console.warn("Player inventory does not have 'plasma' key.");
            }

            return { type: 'generator' };
        }
        return null;
    }

    draw(ctx, camera) {
        // Draw base at world position
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2, // Removed - camera.x
            this.position.y - this.size.y / 2, // Removed - camera.y
            this.size.x,
            this.size.y
        );
        // Draw border, scaling line width
        ctx.strokeStyle = '#274070';
        ctx.lineWidth = 2 / camera.zoom; // Scale line width
        ctx.strokeRect(
            this.position.x - this.size.x / 2, // Removed - camera.x
            this.position.y - this.size.y / 2, // Removed - camera.y
            this.size.x,
            this.size.y
        );
        // Draw internal lines if not used, scaling line width
        if (!this.used) {
             ctx.lineWidth = 1 / camera.zoom; // Scale line width
             const numLines = 3;
             for (let i = 1; i <= numLines; i++) {
                 const lineX = this.position.x - this.size.x / 2 + (this.size.x * i / (numLines + 1)); // Removed - camera.x
                 ctx.beginPath();
                 ctx.moveTo(lineX, this.position.y - this.size.y / 2); // Removed - camera.y
                 ctx.lineTo(lineX, this.position.y + this.size.y / 2); // Removed - camera.y
                 ctx.stroke();
             }
        }
    }

    update(deltaTime) { /* Generators don't update */ }
    takeDamage(amount, source = null, killContext = 'other') { return false; }
    getRectData() { return { x: this.position.x, y: this.position.y, width: this.size.x, height: this.size.y }; }
}
