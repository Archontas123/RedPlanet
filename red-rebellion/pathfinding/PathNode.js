export class PathNode {
    constructor(x, y, parent = null, gCost = 0, hCost = 0) {
        this.x = x;
        this.y = y;
        this.parent = parent;
        this.gCost = gCost;
        this.hCost = hCost;
        this.fCost = gCost + hCost;
    }

    equals(other) {
        return this.x === other.x && this.y === other.y;
    }
}
