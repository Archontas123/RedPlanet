  import { Entity } from './Entity.js';
import { Vector2 } from '../utils.js';

export class Item extends Entity {
    constructor(position, itemType, quantity = 1) {
        let size = new Vector2(15, 15);
        let color = '#ffffff';
        if (itemType === 'Plasma') {
            color = '#00ffff';
        } else if (itemType === 'Medkit') {
            color = '#ff6b6b';
        }

        super(position, size, color);
        this.itemType = itemType;
        this.quantity = quantity;
        this.isInteractable = true;
        this.pickupRadius = 30;
    }

    interact(player) {
        console.log(`Player picked up ${this.quantity} ${this.itemType}`);
        return { pickedUp: true, type: this.itemType, quantity: this.quantity };
    }

    draw(ctx, camera) {
        // Draw diamond shape at world position
        ctx.fillStyle = this.color;
        ctx.beginPath();
        const halfW = this.size.x / 2;
        const halfH = this.size.y / 2;
        ctx.moveTo(this.position.x, this.position.y - halfH); // Removed - camera.x/y
        ctx.lineTo(this.position.x + halfW, this.position.y); // Removed - camera.x/y
        ctx.lineTo(this.position.x, this.position.y + halfH); // Removed - camera.x/y
        ctx.lineTo(this.position.x - halfW, this.position.y); // Removed - camera.x/y
        ctx.closePath();
        ctx.fill();
    }

     update(deltaTime, currentObstacles, allDoors = []) {
        // Items generally don't move or update themselves
    }

    takeDamage(amount, source = null, killContext = 'other') {
        return false;
    }

    getRectData() {
        return {
            x: this.position.x,
            y: this.position.y,
            width: this.size.x,
            height: this.size.y
        };
    }
}
