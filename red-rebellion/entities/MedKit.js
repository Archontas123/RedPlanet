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
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2 - camera.x,
            this.position.y - this.size.y / 2 - camera.y,
            this.size.x,
            this.size.y
        );
        if (!this.opened) {
            ctx.fillStyle = '#ff0000';
            const crossThickness = this.size.x / 5;
            ctx.fillRect(
                this.position.x - crossThickness / 2 - camera.x,
                this.position.y - this.size.y / 2 + crossThickness - camera.y,
                crossThickness,
                this.size.y - crossThickness * 2
            );
            ctx.fillRect(
                this.position.x - this.size.x / 2 + crossThickness - camera.x,
                this.position.y - crossThickness / 2 - camera.y,
                this.size.x - crossThickness * 2,
                crossThickness
            );
        }
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            this.position.x - this.size.x / 2 - camera.x,
            this.position.y - this.size.y / 2 - camera.y,
            this.size.x,
            this.size.y
        );
    }

    update(deltaTime) { /* MedKits don't update */ }
    takeDamage(amount, source = null, killContext = 'other') { return false; }
    getRectData() { return { x: this.position.x, y: this.position.y, width: this.size.x, height: this.size.y }; }
}
