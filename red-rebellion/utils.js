export class Vector2 {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    subtract(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    multiply(scalar) { return new Vector2(this.x * scalar, this.y * scalar); }
    magnitude() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() {
        const mag = this.magnitude();
        return mag === 0 ? new Vector2(0, 0) : new Vector2(this.x / mag, this.y / mag);
    }
    distance(v) { return this.subtract(v).magnitude(); }
    angle() { return Math.atan2(this.y, this.x); }
    static fromAngle(angle, magnitude = 1) {
         return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
    }
}

export function lineIntersectsRect(p1, p2, rect) {
    const { x, y, width, height } = rect;
    const topLeft = { x: x - width / 2, y: y - height / 2 };
    const topRight = { x: x + width / 2, y: y - height / 2 };
    const bottomLeft = { x: x - width / 2, y: y + height / 2 };
    const bottomRight = { x: x + width / 2, y: y + height / 2 };

    return (
        lineIntersectsLine(p1, p2, topLeft, topRight) ||
        lineIntersectsLine(p1, p2, topRight, bottomRight) ||
        lineIntersectsLine(p1, p2, bottomRight, bottomLeft) ||
        lineIntersectsLine(p1, p2, bottomLeft, topLeft)
    );
}

export function lineIntersectsLine(p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (d === 0) return false;

    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const u = -((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)) / d;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
