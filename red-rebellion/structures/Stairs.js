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
        // Draw base at world position
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2, // Removed - camera.x
            this.position.y - this.size.y / 2, // Removed - camera.y
            this.size.x,
            this.size.y
        );
        // Draw steps, scaling line width
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2 / camera.zoom; // Scale line width
        const numSteps = 4;
        for (let i = 1; i < numSteps; i++) {
            const yOffset = (i / numSteps - 0.5) * this.size.y;
            ctx.beginPath();
            ctx.moveTo(this.position.x - this.size.x / 2, this.position.y + yOffset); // Removed - camera.x/y
            ctx.lineTo(this.position.x + this.size.x / 2, this.position.y + yOffset); // Removed - camera.x/y
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
