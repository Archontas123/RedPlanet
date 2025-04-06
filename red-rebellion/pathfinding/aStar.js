import { Vector2 } from '../math/Vector2.js';
import { PathNode } from './PathNode.js';

function heuristic(nodeA, nodeB) {
    return Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);
}

function runAStarOnFloor(startWorldPos, endWorldPos, floorIndex, building, gridSize) {
    if (!building || floorIndex < 0 || floorIndex >= building.floors.length) {
        return null;
    }
    const floor = building.floors[floorIndex];
    const obstacles = building.getObstacles(floorIndex);

    const buildingMinX = building.position.x;
    const buildingMinY = building.position.y;
    const originGridX = Math.floor(buildingMinX / gridSize);
    const originGridY = Math.floor(buildingMinY / gridSize);

    const startNodePos = { x: Math.floor(startWorldPos.x / gridSize) - originGridX, y: Math.floor(startWorldPos.y / gridSize) - originGridY };
    const endNodePos = { x: Math.floor(endWorldPos.x / gridSize) - originGridX, y: Math.floor(endWorldPos.y / gridSize) - originGridY };

    const gridWidth = Math.ceil(building.size.x / gridSize);
    const gridHeight = Math.ceil(building.size.y / gridSize);

    if (gridWidth <= 0 || gridHeight <= 0) return null;

    const grid = Array(gridWidth).fill(null).map(() => Array(gridHeight).fill(true));

    obstacles.forEach(obs => {
        if (obs.isDoor && obs.isOpen) return;
        if (obs.isStairs) return;

        const obsRect = obs.getRectData();
        const startX = Math.max(0, Math.floor((obsRect.x - obsRect.width / 2) / gridSize) - originGridX);
        const endX = Math.min(gridWidth - 1, Math.floor((obsRect.x + obsRect.width / 2) / gridSize) - originGridX);
        const startY = Math.max(0, Math.floor((obsRect.y - obsRect.height / 2) / gridSize) - originGridY);
        const endY = Math.min(gridHeight - 1, Math.floor((obsRect.y + obsRect.height / 2) / gridSize) - originGridY);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
                    grid[x][y] = false;
                }
            }
        }
    });

    function findNearestWalkable(nodeX, nodeY) {
        if (nodeX >= 0 && nodeX < gridWidth && nodeY >= 0 && nodeY < gridHeight && grid[nodeX][nodeY]) {
            return { x: nodeX, y: nodeY };
        }
        const queue = [{ x: nodeX, y: nodeY, dist: 0 }];
        const visited = new Set([`${nodeX},${nodeY}`]);
        const maxSearchDist = 5;

        while (queue.length > 0) {
            const current = queue.shift();
            if (current.dist >= maxSearchDist) continue;
            const neighbors = [
                { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }
            ];
            for (const neighbor of neighbors) {
                const key = `${neighbor.x},${neighbor.y}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    if (neighbor.x >= 0 && neighbor.x < gridWidth && neighbor.y >= 0 && neighbor.y < gridHeight) {
                        if (grid[neighbor.x][neighbor.y]) return { x: neighbor.x, y: neighbor.y };
                        queue.push({ x: neighbor.x, y: neighbor.y, dist: current.dist + 1 });
                    }
                }
            }
        }
        return null;
    }

    const startGridCoords = findNearestWalkable(startNodePos.x, startNodePos.y);
    const endGridCoords = findNearestWalkable(endNodePos.x, endNodePos.y);

    if (!startGridCoords || !endGridCoords) return null;

    const startNode = new PathNode(startGridCoords.x, startGridCoords.y);
    const endNode = new PathNode(endGridCoords.x, endGridCoords.y);

    const openSet = [startNode];
    const closedSet = new Set();

    while (openSet.length > 0) {
        let currentNode = openSet[0];
        let currentIndex = 0;
        for (let i = 1; i < openSet.length; i++) {
            if (openSet[i].fCost < currentNode.fCost || (openSet[i].fCost === currentNode.fCost && openSet[i].hCost < currentNode.hCost)) {
                currentNode = openSet[i];
                currentIndex = i;
            }
        }

        openSet.splice(currentIndex, 1);
        closedSet.add(`${currentNode.x},${currentNode.y}`);

        if (currentNode.equals(endNode)) {
            const path = [];
            let temp = currentNode;
            while (temp !== null) {
                const worldX = (temp.x + originGridX) * gridSize + gridSize / 2;
                const worldY = (temp.y + originGridY) * gridSize + gridSize / 2;
                path.push(new Vector2(worldX, worldY));
                temp = temp.parent;
            }
            return path.reverse();
        }

        const neighbors = [];
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                if (x === 0 && y === 0) continue;
                const checkX = currentNode.x + x;
                const checkY = currentNode.y + y;

                if (checkX >= 0 && checkX < gridWidth && checkY >= 0 && checkY < gridHeight) {
                    if (grid[checkX][checkY] && !closedSet.has(`${checkX},${checkY}`)) {
                        if (x !== 0 && y !== 0) {
                            if (!grid[currentNode.x + x][currentNode.y] || !grid[currentNode.x][currentNode.y + y]) {
                                continue;
                            }
                        }
                        neighbors.push(new PathNode(checkX, checkY));
                    }
                }
            }
        }

        for (const neighbor of neighbors) {
            const newGCost = currentNode.gCost + (neighbor.x === currentNode.x || neighbor.y === currentNode.y ? 1 : 1.414);
            let existingNode = openSet.find(node => node.equals(neighbor));

            if (!existingNode || newGCost < existingNode.gCost) {
                neighbor.gCost = newGCost;
                neighbor.hCost = heuristic(neighbor, endNode);
                neighbor.fCost = neighbor.gCost + neighbor.hCost;
                neighbor.parent = currentNode;

                if (!existingNode) {
                    openSet.push(neighbor);
                }
            }
        }
    }

    return null;
}

export function findPath(startWorldPos, startFloorIndex, endWorldPos, endFloorIndex, building, gridSize = 20) {
    if (!building) return null;

    if (startFloorIndex === endFloorIndex) {
        return runAStarOnFloor(startWorldPos, endWorldPos, startFloorIndex, building, gridSize);
    }

    let shortestPath = null;
    let minCost = Infinity;

    const startFloor = building.floors[startFloorIndex];
    if (!startFloor) return null;

    const targetFloorDirection = endFloorIndex > startFloorIndex ? 1 : -1;
    const relevantStairs = startFloor.stairs.filter(s => s.targetFloor === startFloorIndex + targetFloorDirection);

    if (relevantStairs.length === 0) {
        console.warn(`No direct stairs found from floor ${startFloorIndex} towards ${endFloorIndex}`);
        return null;
    }

    for (const stair of relevantStairs) {
        const pathToStair = runAStarOnFloor(startWorldPos, stair.position, startFloorIndex, building, gridSize);

        if (pathToStair && pathToStair.length > 0) {
            const costToStair = (pathToStair.length - 1);
            const pathFromStair = findPath(stair.targetPosition, stair.targetFloor, endWorldPos, endFloorIndex, building, gridSize);

            if (pathFromStair && pathFromStair.length > 0) {
                const costFromStair = (pathFromStair.length - 1);
                const totalCost = costToStair + costFromStair + 5;

                if (totalCost < minCost) {
                    minCost = totalCost;
                    shortestPath = pathToStair.concat(pathFromStair);
                }
            }
        }
    }

    return shortestPath;
}
