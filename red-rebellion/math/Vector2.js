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
    magnitudeSq() { return this.x * this.x + this.y * this.y; }
    distance(v) { return this.subtract(v).magnitude(); }
    distanceSq(v) { return this.subtract(v).magnitudeSq(); }
    angle() { return Math.atan2(this.y, this.x); }
    static fromAngle(angle, magnitude = 1) {
         return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
    }
    clone() {
        return new Vector2(this.x, this.y);
    }
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }
}
