import { Vector2 } from '../utils.js';

export class Room {
    constructor(x, y, width, height) {
        this.rect = { x, y, width, height };
        this.center = new Vector2(x + width / 2, y + height / 2);
        this.interactables = [];
        this.doors = [];
    }

    containsPoint(point) {
        return (
            point.x >= this.rect.x &&
            point.x < this.rect.x + this.rect.width &&
            point.y >= this.rect.y &&
            point.y < this.rect.y + this.rect.height
        );
    }
}
