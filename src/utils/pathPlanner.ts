import * as THREE from "three";

// ==================== Path node ====================

// A* path node
class PathNode {
    position: THREE.Vector3;
    g: number = Infinity; // actual cost
    h: number = 0;        // heuristic cost
    f: number = Infinity; // f = g + h
    parent: PathNode | null = null;

    constructor(position: THREE.Vector3) {
        this.position = position.clone();
    }

    // Node equality
    equals(other: PathNode): boolean {
        return this.position.distanceTo(other.position) < 0.01;
    }
}

// ==================== Priority queue ====================

// Priority queue for the A* open list
class PriorityQueue<T> {
    elements: Array<{ priority: number; item: T }> = [];

    // Enqueue and sort
    enqueue(item: T, priority: number) {
        this.elements.push({ priority, item });
        this.elements.sort((a, b) => a.priority - b.priority);
    }

    // Dequeue lowest priority
    dequeue(): T | undefined {
        return this.elements.shift()?.item;
    }

    isEmpty(): boolean {
        return this.elements.length === 0;
    }

    contains(item: T, compareFn: (a: T, b: T) => boolean): boolean {
        return this.elements.some((e) => compareFn(e.item, item));
    }

    // Update a node's priority
    update(item: T, newPriority: number, compareFn: (a: T, b: T) => boolean) {
        const index = this.elements.findIndex((e) => compareFn(e.item, item));
        if (index !== -1) {
            this.elements[index].priority = newPriority;
            this.elements.sort((a, b) => a.priority - b.priority);
        }
    }
}

// ==================== Interfaces ====================

// Obstacle query
export interface ObstacleChecker {
    // True if the segment start->end is blocked
    isBlocked(start: THREE.Vector3, end: THREE.Vector3): boolean;
    // Navigation nodes around obstacles
    getNavigationNodes(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[];
}

// Path planner config
export interface PathPlannerConfig {
    debugEnabled?: boolean; // path visualization
    scene?: THREE.Scene; // scene used for visualization
    scale?: number;      // scale factor
}

// ==================== Path planner ====================

// A* path planner
export class PathPlanner {
    obstacleChecker: ObstacleChecker;
    config: PathPlannerConfig;
    debugLines: THREE.Line[] = [];
    debugPoints: THREE.Mesh[] = [];

    constructor(obstacleChecker: ObstacleChecker, config: PathPlannerConfig = {}) {
        this.obstacleChecker = obstacleChecker;
        this.config = { debugEnabled: false, scale: 1, ...config };
    }

    // Heuristic distance
    private heuristic(a: THREE.Vector3, b: THREE.Vector3): number {
        return a.distanceTo(b);
    }

    // A* entry
    findPath(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[] {
        // Straight line if unblocked
        if (!this.obstacleChecker.isBlocked(start, goal)) return [goal];

        // Candidate navigation nodes
        const navigationPoints = this.obstacleChecker.getNavigationNodes(start, goal);
        const allNodes = [new PathNode(start), new PathNode(goal), ...navigationPoints.map((p) => new PathNode(p))];

        if (allNodes.length < 2) {
            console.warn("Not enough navigation nodes; returning a straight path");
            return [goal];
        }

        const startNode = allNodes[0];
        const goalNode = allNodes[1];

        // Seed start cost
        startNode.g = 0;
        startNode.h = this.heuristic(startNode.position, goalNode.position);
        startNode.f = startNode.h;

        const openList = new PriorityQueue<PathNode>();
        const closedSet = new Set<PathNode>();
        const nodeEquals = (a: PathNode, b: PathNode) => a.equals(b);
        openList.enqueue(startNode, startNode.f);

        // A* loop
        while (!openList.isEmpty()) {
            const current = openList.dequeue();
            if (!current) break;

            // Goal reached: reconstruct
            if (current.equals(goalNode)) {
                const path = this.reconstructPath(current);
                if (this.config.debugEnabled) this.visualizePath([start, ...path]);
                return path;
            }

            closedSet.add(current);

            // Neighbors
            for (const neighbor of allNodes) {
                if (closedSet.has(neighbor)) continue;
                if (this.obstacleChecker.isBlocked(current.position, neighbor.position)) continue;

                const tentativeG = current.g + current.position.distanceTo(neighbor.position);
                if (tentativeG < neighbor.g) {
                    neighbor.parent = current;
                    neighbor.g = tentativeG;
                    neighbor.h = this.heuristic(neighbor.position, goalNode.position);
                    neighbor.f = neighbor.g + neighbor.h;

                    if (openList.contains(neighbor, nodeEquals)) openList.update(neighbor, neighbor.f, nodeEquals);
                    else openList.enqueue(neighbor, neighbor.f);
                }
            }
        }

        console.warn("A* found no path; using a straight path");
        return [goal];
    }

    // Reconstruct path
    private reconstructPath(endNode: PathNode): THREE.Vector3[] {
        const path: THREE.Vector3[] = [];
        let current: PathNode | null = endNode;
        while (current !== null) {
            path.unshift(current.position.clone());
            current = current.parent;
        }
        // Drop start, then smooth
        if (path.length > 0) path.shift();
        return this.smoothPath(path);
    }

    // Path smoothing
    private smoothPath(path: THREE.Vector3[]): THREE.Vector3[] {
        if (path.length <= 2) return path;
        const smoothed: THREE.Vector3[] = [path[0]];
        let current = 0;
        while (current < path.length - 1) {
            // Skip as many intermediate nodes as possible
            let farthest = current + 1;
            for (let i = path.length - 1; i > current + 1; i--) {
                if (!this.obstacleChecker.isBlocked(path[current], path[i])) { farthest = i; break; }
            }
            smoothed.push(path[farthest]);
            current = farthest;
        }
        return smoothed;
    }

    // Visualize path
    private visualizePath(path: THREE.Vector3[]) {
        if (!this.config.scene || !this.config.debugEnabled) return;
        this.clearVisualization();
        const scale = this.config.scale || 1;

        // Path polyline
        if (path.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints(path.map(p => p.clone()));
            const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 }));
            this.config.scene.add(line);
            this.debugLines.push(line);
        }

        // Waypoint spheres
        path.forEach((point, index) => {
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(20 * scale),
                new THREE.MeshBasicMaterial({ color: index === path.length - 1 ? 0xff0000 : 0x00ff00 }),
            );
            sphere.position.copy(point);
            this.config.scene!.add(sphere);
            this.debugPoints.push(sphere);
        });
    }

    // Clear path visualization
    clearVisualization() {
        if (!this.config.scene) return;
        this.debugLines.forEach(line => {
            this.config.scene!.remove(line);
            line.geometry.dispose();
            (line.material as THREE.Material).dispose();
        });
        this.debugLines = [];
        this.debugPoints.forEach(point => {
            this.config.scene!.remove(point);
            point.geometry.dispose();
            (point.material as THREE.Material).dispose();
        });
        this.debugPoints = [];
    }

    // Update config
    updateConfig(config: Partial<PathPlannerConfig>) {
        this.config = { ...this.config, ...config };
    }

    // Dispose planner
    dispose() {
        this.clearVisualization();
    }
}
