import { Entity } from './Entity.js';
import { Vector2 } from '../utils.js';

export class MedKit extends Entity {
    constructor(position) {
        super(position, new Vector2(25, 25), '#ffffff');
        this.isInteractable = true;
        this.isMedKit = true;
        this.opened = false;
    }

    interact(player) {
        if (!this.opened) {
            this.opened = true;
            this.isInteractable = false;
            this.color = '#cccccc';

            const drops = [{ type: 'heal', quantity: 1 }];
            return drops;
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
        // Draw cross if not opened, scaling thickness inversely with zoom
        if (!this.opened) {
            ctx.fillStyle = '#ff0000';
            const crossThickness = (this.size.x / 5) / camera.zoom; // Scale thickness
            const scaledCrossOffset = crossThickness * camera.zoom; // Use original scale for positioning relative to size
            ctx.fillRect(
                this.position.x - crossThickness / 2, // Removed - camera.x
                this.position.y - this.size.y / 2 + scaledCrossOffset, // Removed - camera.y, adjust offset
                crossThickness,
                this.size.y - scaledCrossOffset * 2
            );
            ctx.fillRect(
                this.position.x - this.size.x / 2 + scaledCrossOffset, // Removed - camera.x, adjust offset
                this.position.y - crossThickness / 2, // Removed - camera.y
                this.size.x - scaledCrossOffset * 2,
                crossThickness
            );
        }
        // Draw border, scaling line width
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1 / camera.zoom; // Scale line width
        ctx.strokeRect(
            this.position.x - this.size.x / 2, // Removed - camera.x
            this.position.y - this.size.y / 2, // Removed - camera.y
            this.size.x,
            this.size.y
        );
    }

    update(deltaTime) { /* MedKits don't update */ }
    takeDamage(amount, source = null, killContext = 'other') { return false; }
    getRectData() { return { x: this.position.x, y: this.position.y, width: this.size.x, height: this.size.y }; }
}
