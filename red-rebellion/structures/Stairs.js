import { Vector2 } from '../utils.js';

const STAIRS_COLOR = '#a5a5a5';

export class Stairs {
    constructor(position, size, targetFloor, targetPosition) {
        this.position = position;
        this.size = size;
        this.targetFloor = targetFloor;
        this.targetPosition = targetPosition;
        this.color = STAIRS_COLOR;
        this.isStairs = true;
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2 - camera.x,
            this.position.y - this.size.y / 2 - camera.y,
            this.size.x,
            this.size.y
        );
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        const numSteps = 4;
        for (let i = 1; i < numSteps; i++) {
            const yOffset = (i / numSteps - 0.5) * this.size.y;
            ctx.beginPath();
            ctx.moveTo(this.position.x - this.size.x / 2 - camera.x, this.position.y + yOffset - camera.y);
            ctx.lineTo(this.position.x + this.size.x / 2 - camera.x, this.position.y + yOffset - camera.y);
            ctx.stroke();
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

    interact() {
        return { type: 'stairs', targetFloor: this.targetFloor, targetPosition: this.targetPosition };
    }
}
