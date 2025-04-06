import { Vector2 } from './Vector2.js';

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

export function rayIntersectsRectDetailed(rayOrigin, rayDir, rect) {
    const { x, y, width, height } = rect;
    const minX = x - width / 2;
    const maxX = x + width / 2;
    const minY = y - height / 2;
    const maxY = y + height / 2;

    let tmin = -Infinity;
    let tmax = Infinity;
    let hitNormal = new Vector2(0, 0);

    const dirLength = rayDir.magnitude();
    if (dirLength < 1e-6) return null;
    const invDir = new Vector2(1.0 / rayDir.x, 1.0 / rayDir.y);

    let tNearX = (minX - rayOrigin.x) * invDir.x;
    let tFarX = (maxX - rayOrigin.x) * invDir.x;
    if (tNearX > tFarX) [tNearX, tFarX] = [tFarX, tNearX];

    if (tNearX > tmin) {
        tmin = tNearX;
        hitNormal = new Vector2(rayDir.x > 0 ? -1 : 1, 0);
    }
    tmax = Math.min(tmax, tFarX);
    if (tmin > tmax) return null;

    let tNearY = (minY - rayOrigin.y) * invDir.y;
    let tFarY = (maxY - rayOrigin.y) * invDir.y;
    if (tNearY > tFarY) [tNearY, tFarY] = [tFarY, tNearY];

    if (tNearY > tmin) {
        tmin = tNearY;
        hitNormal = new Vector2(0, rayDir.y > 0 ? -1 : 1);
    }
    tmax = Math.min(tmax, tFarY);

    if (tmin > tmax || tmax < 0) {
        return null;
    }

    if (tmin * dirLength >= 0 && tmin * dirLength <= dirLength) {
         return { t: tmin, normal: hitNormal };
    }

    return null;
}

export function isLineOfSightClear(startPos, endPos, obstacles) {
     for (const obstacle of obstacles) {
          if (lineIntersectsRect(startPos, endPos, obstacle.getRectData())) {
               return false;
          }
     }
     return true;
}
