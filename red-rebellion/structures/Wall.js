import { Vector2 } from '../utils.js';

const WALL_COLOR = '#888888';

export class Wall {
    constructor(position, size) {
        this.position = position;
        this.size = size;
        this.color = WALL_COLOR;
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        const drawBuffer = 1;
        ctx.fillRect(
            this.position.x - this.size.x / 2 - drawBuffer - camera.x,
            this.position.y - this.size.y / 2 - drawBuffer - camera.y,
            this.size.x + drawBuffer * 2,
            this.size.y + drawBuffer * 2
        );
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
