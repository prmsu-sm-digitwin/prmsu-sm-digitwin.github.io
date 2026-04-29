//  js/pathfinding.js  —  A* on the campus waypoint graph
//  Called by main.js:  findPath(waypointMap, startId, goalId)
//  Returns: array of waypoint ids  "main_gate","inner_gate" or [] if no path exists


function findPath(waypointMap, startId, goalId) {

  if (startId === goalId) {
    console.log('[A*] Start === Goal. No movement needed.');
    return [startId];
  }
  if (!waypointMap[startId]) {
    console.warn('[A*] Start node not found:', startId);
    return [];
  }
  if (!waypointMap[goalId]) {
    console.warn('[A*] Goal node not found:', goalId);
    return [];
  }

  // Heuristic  straight-line distance on the x/z plane
  function h(aId, bId) {
    const a = waypointMap[aId].position;
    const b = waypointMap[bId].position;
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // A* data structures 
  const openSet   = new Set([startId]);  // nodes queued for evaluation
  const cameFrom  = {};                  // cameFrom[n] = the node before n in best path

  const gScore = {};   // actual cost from start → node
  const fScore = {};   // gScore + heuristic (estimated total cost through node)

  for (const id in waypointMap) {
    gScore[id] = Infinity;
    fScore[id] = Infinity;
  }
  gScore[startId] = 0;
  fScore[startId] = h(startId, goalId);

  // Main loop 
  let iterations = 0;
  const ITER_LIMIT = 1000;   

  while (openSet.size > 0) {

    iterations++;
    if (iterations > ITER_LIMIT) {
      console.warn('[A*] Hit iteration limit — aborting. Check graph connectivity.');
      return [];
    }


    let current = null;
    let lowestF  = Infinity;
    for (const id of openSet) {
      if (fScore[id] < lowestF) {
        lowestF  = fScore[id];
        current  = id;
      }
    }


    if (current === goalId) {
      const path = [];
      let node = goalId;
      while (node !== undefined) {
        path.unshift(node);
        node = cameFrom[node];
      }
      console.log(`[A*] Path found in ${iterations} iterations (${path.length} nodes):`, path);
      return path;
    }

    openSet.delete(current);


    const neighbors = waypointMap[current].neighbors || [];

    for (const neighborId of neighbors) {

      //skip if neighbor id doesn't exist in map
      if (!waypointMap[neighborId]) {
        console.warn(`[A*] Neighbor "${neighborId}" not in waypointMap (referenced by "${current}"). Check campus.json.`);
        continue;
      }

      const tentativeG = gScore[current] + h(current, neighborId);

      if (tentativeG < gScore[neighborId]) {
        cameFrom[neighborId]  = current;
        gScore[neighborId]    = tentativeG;
        fScore[neighborId]    = tentativeG + h(neighborId, goalId);
        openSet.add(neighborId);
      }
    }
  }

  console.warn(`[A*] No path found from "${startId}" to "${goalId}". Nodes may be disconnected.`);
  return [];
}