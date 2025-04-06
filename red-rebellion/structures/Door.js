import { Vector2 } from '../utils.js';

const DOOR_COLOR_CLOSED = '#a0522d';
const DOOR_COLOR_OPEN = '#d2b48c';

export class Door {
    constructor(position, size, isExternal = false) {
        this.position = position;
        this.size = size;
        this.isOpen = false;
        this.isExternal = isExternal;
        this.color = DOOR_COLOR_CLOSED;
        this.isDoor = true;
    }

    interact() {
        this.isOpen = !this.isOpen;
        this.color = this.isOpen ? DOOR_COLOR_OPEN : DOOR_COLOR_CLOSED;
        console.log(`Door instance interacted. New state: isOpen=${this.isOpen}, color=${this.color}`);
        return { type: 'door' };
    }

     open() {
        if (!this.isOpen) {
            this.isOpen = true;
            this.color = DOOR_COLOR_OPEN;
        }
    }

    close() {
        if (this.isOpen) {
            this.isOpen = false;
            this.color = DOOR_COLOR_CLOSED;
        }
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2 - camera.x,
            this.position.y - this.size.y / 2 - camera.y,
            this.size.x,
            this.size.y
        );

        if (!this.isOpen) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            const knobSize = Math.min(this.size.x, this.size.y) * 0.2;
            ctx.fillRect(
                this.position.x - knobSize / 2 - camera.x,
                this.position.y - knobSize / 2 - camera.y,
                knobSize,
                knobSize
            );
        }
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
