import { Vector2 } from './utils.js';

class PathNode {
    constructor(x, y, parent = null, gCost = 0, hCost = 0) {
        this.x = x; // Grid coordinates, not world coordinates
        this.y = y;
        this.parent = parent;
        this.gCost = gCost; // Cost from start to this node
        this.hCost = hCost; // Heuristic cost from this node to end
        this.fCost = gCost + hCost; // Total cost
    }

    equals(other) {
        return this.x === other.x && this.y === other.y;
    }
}

function heuristic(nodeA, nodeB) {
    // Manhattan distance heuristic
    return Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);
}

export function findPath(startWorldPos, endWorldPos, obstacles, worldBounds, gridSize = 20) {
    const startNodePos = { x: Math.floor(startWorldPos.x / gridSize), y: Math.floor(startWorldPos.y / gridSize) };
    const endNodePos = { x: Math.floor(endWorldPos.x / gridSize), y: Math.floor(endWorldPos.y / gridSize) };

    // Determine grid boundaries based on start/end and potential obstacles
    const searchRadius = 30; // Grid units around start/end to consider initially
    const minGridX = Math.max(0, Math.floor(worldBounds.minX / gridSize), Math.min(startNodePos.x, endNodePos.x) - searchRadius);
    const maxGridX = Math.min(Math.floor(worldBounds.maxX / gridSize), Math.max(startNodePos.x, endNodePos.x) + searchRadius);
    const minGridY = Math.max(0, Math.floor(worldBounds.minY / gridSize), Math.min(startNodePos.y, endNodePos.y) - searchRadius);
    const maxGridY = Math.min(Math.floor(worldBounds.maxY / gridSize), Math.max(startNodePos.y, endNodePos.y) + searchRadius);

    const gridWidth = maxGridX - minGridX + 1;
    const gridHeight = maxGridY - minGridY + 1;

    if (gridWidth <= 0 || gridHeight <= 0) return null; // Invalid grid

    // Create the grid and mark obstacles
    const grid = Array(gridWidth).fill(null).map(() => Array(gridHeight).fill(true)); // true = walkable

    obstacles.forEach(obs => {
        const obsRect = obs.getRectData();
        const startX = Math.floor((obsRect.x - obsRect.width / 2) / gridSize);
        const endX = Math.floor((obsRect.x + obsRect.width / 2) / gridSize);
        const startY = Math.floor((obsRect.y - obsRect.height / 2) / gridSize);
        const endY = Math.floor((obsRect.y + obsRect.height / 2) / gridSize);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const gridX = x - minGridX;
                const gridY = y - minGridY;
                if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
                    grid[gridX][gridY] = false; // Mark as unwalkable
                }
            }
        }
    });

    // Adjust start/end nodes if they fall inside an obstacle (find nearest walkable)
    function findNearestWalkable(nodeX, nodeY) {
        if (nodeX >= 0 && nodeX < gridWidth && nodeY >= 0 && nodeY < gridHeight && grid[nodeX][nodeY]) {
            return { x: nodeX, y: nodeY };
        }
        const queue = [{ x: nodeX, y: nodeY, dist: 0 }];
        const visited = new Set([`${nodeX},${nodeY}`]);
        const maxSearchDist = 5; // Limit search radius

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
                        if (grid[neighbor.x][neighbor.y]) {
                            return { x: neighbor.x, y: neighbor.y }; // Found walkable
                        }
                        queue.push({ x: neighbor.x, y: neighbor.y, dist: current.dist + 1 });
                    }
                }
            }
        }
        return null; // No walkable node found nearby
    }

    const startGridCoords = findNearestWalkable(startNodePos.x - minGridX, startNodePos.y - minGridY);
    const endGridCoords = findNearestWalkable(endNodePos.x - minGridX, endNodePos.y - minGridY);

    if (!startGridCoords || !endGridCoords) return null; // Cannot path from/to inside obstacle

    const startNode = new PathNode(startGridCoords.x, startGridCoords.y);
    const endNode = new PathNode(endGridCoords.x, endGridCoords.y);


    const openSet = [startNode];
    const closedSet = new Set();

    while (openSet.length > 0) {
        // Find node with lowest fCost in openSet
        let currentNode = openSet[0];
        for (let i = 1; i < openSet.length; i++) {
            if (openSet[i].fCost < currentNode.fCost || (openSet[i].fCost === currentNode.fCost && openSet[i].hCost < currentNode.hCost)) {
                currentNode = openSet[i];
            }
        }

        // Remove currentNode from openSet and add to closedSet
        const currentIndex = openSet.indexOf(currentNode);
        openSet.splice(currentIndex, 1);
        closedSet.add(`${currentNode.x},${currentNode.y}`);

        // Found the path
        if (currentNode.equals(endNode)) {
            const path = [];
            let temp = currentNode;
            while (temp !== null) {
                // Convert grid coords back to world coords (center of grid cell)
                const worldX = (temp.x + minGridX) * gridSize + gridSize / 2;
                const worldY = (temp.y + minGridY) * gridSize + gridSize / 2;
                path.push(new Vector2(worldX, worldY));
                temp = temp.parent;
            }
            return path.reverse(); // Return world coordinate path
        }

        // Get neighbors (including diagonals)
        const neighbors = [];
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                if (x === 0 && y === 0) continue;
                const checkX = currentNode.x + x;
                const checkY = currentNode.y + y;

                // Check if neighbor is within grid bounds
                if (checkX >= 0 && checkX < gridWidth && checkY >= 0 && checkY < gridHeight) {
                     // Check if walkable and not in closed set
                     if (grid[checkX][checkY] && !closedSet.has(`${checkX},${checkY}`)) {
                          // Diagonal movement check: prevent cutting corners through obstacles
                          if (x !== 0 && y !== 0) { // If diagonal
                               if (!grid[currentNode.x + x][currentNode.y] || !grid[currentNode.x][currentNode.y + y]) {
                                    continue; // Blocked corner
                               }
                          }
                          neighbors.push(new PathNode(checkX, checkY));
                     }
                }
            }
        }


        for (const neighbor of neighbors) {
            const newGCost = currentNode.gCost + (neighbor.x === currentNode.x || neighbor.y === currentNode.y ? 1 : 1.414); // Cost 1 for straight, sqrt(2) for diagonal

            let existingNode = null;
            for(const node of openSet) {
                if (node.equals(neighbor)) {
                    existingNode = node;
                    break;
                }
            }

            if (existingNode === null || newGCost < existingNode.gCost) {
                neighbor.gCost = newGCost;
                neighbor.hCost = heuristic(neighbor, endNode);
                neighbor.fCost = neighbor.gCost + neighbor.hCost;
                neighbor.parent = currentNode;

                if (existingNode === null) {
                    openSet.push(neighbor);
                }
            }
        }
    }

    return null; // No path found
}
