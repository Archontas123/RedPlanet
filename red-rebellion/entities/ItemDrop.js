import { Entity } from './Entity.js';
import { Vector2 } from '../utils.js';

export class ItemDrop extends Entity {
    constructor(position, itemType, quantity = 1, floorIndex = 0) {
        let size = new Vector2(15, 15);
        let color = '#ffffff';
        if (itemType === 'rock') {
            color = '#808080';
        } else if (itemType === 'wood') {
            color = '#8B4513';
        } else if (itemType === 'heal') {
            color = '#ff6b6b';
        }

        super(position, size, color);
        this.itemType = itemType;
        this.quantity = quantity;
        this.isPickup = true;
        this.pickupRadius = 40;
        this.lifeTime = 60;
        this.floorIndex = floorIndex;
    }

    update(deltaTime) {
        this.lifeTime -= deltaTime;
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(
            this.position.x - camera.x,
            this.position.y - camera.y,
            this.size.x / 2,
            0, Math.PI * 2
        );
        ctx.fill();
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
