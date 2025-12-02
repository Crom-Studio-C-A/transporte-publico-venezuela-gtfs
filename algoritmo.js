/**
 * planificador_rutas.js
 * Motor de planificación de rutas de transporte público multimodal (GTFS).
 * * CARACTERÍSTICAS:
 * - Algoritmo A* (A-Star) para optimización de búsqueda.
 * - Indexación espacial (Spatial Hash Grid) para búsquedas de vecinos O(1).
 * - Clasificación automática de rutas (Urbano vs Interurbano).
 * - Función de costo configurable (Tiempo vs Dinero vs Transbordos).
 * - Soporte multimodal (Caminata, Bus, Taxi/Coche primera milla).
 * - Búsqueda binaria en tablas de tiempos.
 * * @version 2.0.0
 * @author Senior Software Engineer AI
 */

// --- 1. DEFINICIONES DE TIPOS (JSDoc) ---

/**
 * @typedef {Object} GTFSStop
 * @property {string} stop_id
 * @property {string} stop_name
 * @property {number} stop_lat
 * @property {number} stop_lon
 * @property {number} location_type 0: parada, 1: estación
 * @property {string} [parent_station]
 */

/**
 * @typedef {Object} GTFSRoute
 * @property {string} route_id
 * @property {string} route_short_name
 * @property {string} route_long_name
 * @property {number} route_type
 * @property {boolean} [is_interurban] Propiedad inferida: true si es larga distancia
 * @property {number} [avg_stop_dist] Propiedad inferida: distancia media entre paradas
 */

/**
 * @typedef {Object} GTFSTrip
 * @property {string} trip_id
 * @property {string} route_id
 * @property {string} service_id
 * @property {string} trip_headsign
 * @property {number} [direction_id]
 */

/**
 * @typedef {Object} GTFSStopTime
 * @property {string} trip_id
 * @property {string} arrival_time "HH:MM:SS"
 * @property {string} departure_time "HH:MM:SS"
 * @property {string} stop_id
 * @property {number} stop_sequence
 * @property {number} [arrival_sec] Pre-calculado
 * @property {number} [departure_sec] Pre-calculado
 */

/**
 * @typedef {Object} GTFSCalendar
 * @property {string} service_id
 * @property {number} monday 1 o 0
 * @property {number} tuesday
 * @property {number} wednesday
 * @property {number} thursday
 * @property {number} friday
 * @property {number} saturday
 * @property {number} sunday
 * @property {number} start_date YYYYMMDD
 * @property {number} end_date YYYYMMDD
 */

/**
 * @typedef {Object} UserPreferences
 * @property {number} weightTime Multiplicador de valor del tiempo (1.0 estándar)
 * @property {number} weightCost Multiplicador de costo monetario (ej: 60.0 = 1$ vale 1 min)
 * @property {number} weightTransfers Penalización por transbordo en "segundos percibidos"
 * @property {number} maxWalkDist Distancia máxima de caminata en metros
 * @property {boolean} allowTaxi Permitir taxi si no hay paradas cerca
 */

/**
 * @typedef {Object} PathSegment
 * @property {'WALK'|'TRANSIT'|'CAR_RIDE_SHARE'} type
 * @property {string} fromStopId
 * @property {string} toStopId
 * @property {number} startTime Segundos desde medianoche
 * @property {number} endTime Segundos desde medianoche
 * @property {number} duration Segundos
 * @property {number} distance Kilómetros
 * @property {string} [tripId] Solo TRANSIT
 * @property {string} [routeId] Solo TRANSIT
 * @property {number} cost Costo monetario
 * @property {number} wait Tiempo de espera en segundos
 * @property {string} description Descripción humana
 */

// --- 2. ESTRUCTURAS DE DATOS OPTIMIZADAS ---

/**
 * Cola de Prioridad Minimizante (MinHeap).
 * Esencial para A* y Dijkstra.
 * Complejidad: O(log N) push/pop.
 */
class MinPriorityQueue {
    constructor() {
        /** @type {{val: any, priority: number}[]} */
        this.heap = [];
    }

    /**
     * @param {any} val El estado o nodo
     * @param {number} priority El costo f(n) = g(n) + h(n)
     */
    push(val, priority) {
        this.heap.push({ val, priority });
        this.bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.heap.length === 0) return null;
        const min = this.heap[0];
        const end = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = end;
            this.sinkDown(0);
        }
        return min.val;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    bubbleUp(n) {
        while (n > 0) {
            let parent = Math.floor((n - 1) / 2);
            if (this.heap[n].priority >= this.heap[parent].priority) break;
            [this.heap[n], this.heap[parent]] = [this.heap[parent], this.heap[n]];
            n = parent;
        }
    }

    sinkDown(n) {
        const length = this.heap.length;
        const element = this.heap[n];
        
        while (true) {
            let child2N = (n + 1) * 2;
            let child1N = child2N - 1;
            let swap = null;

            if (child1N < length) {
                const child1 = this.heap[child1N];
                if (child1.priority < element.priority) {
                    swap = child1N;
                }
            }

            if (child2N < length) {
                const child2 = this.heap[child2N];
                const child1Priority = (swap === null) ? element.priority : this.heap[child1N].priority;
                if (child2.priority < child1Priority) {
                    swap = child2N;
                }
            }

            if (swap === null) break;
            [this.heap[n], this.heap[swap]] = [this.heap[swap], this.heap[n]];
            n = swap;
        }
    }
}

/**
 * Grid Espacial (Spatial Hashing).
 * Permite encontrar paradas cercanas en O(1) en lugar de O(N).
 * Divide el mapa en celdas de tamaño fijo.
 */
class SpatialGrid {
    /**
     * @param {number} cellSizeKm Tamaño de la celda en KM (ej: 1.0)
     */
    constructor(cellSizeKm = 1.0) {
        this.grid = new Map();
        this.cellSizeKm = cellSizeKm;
    }

    /**
     * Genera una clave única "latIdx,lonIdx" para coordenadas.
     * Ajusta la longitud según la latitud para mantener celdas cuadradas aprox.
     */
    getKey(lat, lon) {
        const latIdx = Math.floor(lat / (this.cellSizeKm / 111));
        // Ajuste longitudinal por latitud (coseno)
        const lonIdx = Math.floor(lon / (this.cellSizeKm / (111 * Math.cos(lat * (Math.PI / 180)))));
        return `${latIdx},${lonIdx}`;
    }

    /**
     * @param {GTFSStop} stop 
     */
    addStop(stop) {
        const key = this.getKey(stop.stop_lat, stop.stop_lon);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key).push(stop.stop_id);
    }

    /**
     * Obtiene paradas en la celda del punto y sus 8 vecinos.
     * @param {number} lat 
     * @param {number} lon 
     * @returns {string[]} Lista de IDs de paradas candidatas
     */
    getNeighbors(lat, lon) {
        const centerLatIdx = Math.floor(lat / (this.cellSizeKm / 111));
        const centerLonIdx = Math.floor(lon / (this.cellSizeKm / (111 * Math.cos(lat * (Math.PI / 180)))));
        
        let candidates = [];
        
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = `${centerLatIdx + dx},${centerLonIdx + dy}`;
                const cellStops = this.grid.get(key);
                if (cellStops) {
                    candidates = candidates.concat(cellStops);
                }
            }
        }
        return candidates;
    }
}

// --- 3. CLASE PRINCIPAL DEL SISTEMA ---

class TransitEngine {
    constructor() {
        // Datos en memoria
        this.stops = new Map();
        this.routes = new Map();
        this.trips = new Map();
        this.stopTimesByTrip = new Map(); // TripID -> Array StopTime
        this.stopTimesByStop = new Map(); // StopID -> Array StopTime (Ordenado por hora)
        this.calendars = new Map();
        
        // Índices
        this.spatialGrid = new SpatialGrid(1.0); // Celdas de 1km
        
        // Constantes Física/Lógica
        this.WALK_SPEED_MPS = 1.1; // ~4 km/h
        this.MAX_TRANSIT_SPEED_MPS = 25.0; // ~90 km/h (para heurística optimista)
        this.CAR_SPEED_MPS = 11.1; // ~40 km/h (para primera milla)
        this.TAXI_BASE_FARE = 5.0; // Costo base taxi
        this.TAXI_KM_FARE = 2.0;   // Costo km taxi
    }

    // --- CARGA Y PREPROCESAMIENTO ---

    /**
     * Carga datos masivos y realiza inferencias (Urbano vs Interurbano).
     * @param {GTFSStop[]} stops 
     * @param {GTFSRoute[]} routes 
     * @param {GTFSTrip[]} trips 
     * @param {GTFSStopTime[]} stopTimes 
     * @param {GTFSCalendar[]} calendars 
     */
    loadData(stops, routes, trips, stopTimes, calendars) {
        console.time("loadData");

        // 1. Cargar Paradas e Indexar Espacialmente
        stops.forEach(s => {
            // Asegurar tipos numéricos
            s.stop_lat = Number(s.stop_lat);
            s.stop_lon = Number(s.stop_lon);
            this.stops.set(s.stop_id, s);
            this.spatialGrid.addStop(s);
        });

        // 2. Cargar Calendarios
        calendars.forEach(c => this.calendars.set(c.service_id, c));

        // 3. Cargar Trips
        trips.forEach(t => this.trips.set(t.trip_id, t));

        // 4. Cargar StopTimes y Ordenar
        const tempByTrip = {};
        const tempByStop = {};

        stopTimes.forEach(st => {
            // Pre-cálculo de segundos para evitar re-parsear strings miles de veces
            st.arrival_sec = this.timeToSeconds(st.arrival_time);
            st.departure_sec = this.timeToSeconds(st.departure_time);
            st.stop_sequence = Number(st.stop_sequence);

            if (!tempByTrip[st.trip_id]) tempByTrip[st.trip_id] = [];
            tempByTrip[st.trip_id].push(st);

            if (!tempByStop[st.stop_id]) tempByStop[st.stop_id] = [];
            tempByStop[st.stop_id].push(st);
        });

        // Guardar y ordenar
        for (const tid in tempByTrip) {
            // Ordenar por secuencia para recorrer el viaje
            tempByTrip[tid].sort((a, b) => a.stop_sequence - b.stop_sequence);
            this.stopTimesByTrip.set(tid, tempByTrip[tid]);
        }

        for (const sid in tempByStop) {
            // Ordenar por hora de salida para Búsqueda Binaria
            tempByStop[sid].sort((a, b) => a.departure_sec - b.departure_sec);
            this.stopTimesByStop.set(sid, tempByStop[sid]);
        }

        // 5. INFERENCIA DE TIPOS DE RUTA (Lógica Híbrida)
        // Calculamos la distancia total y promedio de la ruta para saber si es INTERURBANA
        routes.forEach(r => {
            let totalDist = 0;
            let segments = 0;
            
            // Tomamos el primer viaje asociado para muestrear
            // (En un sistema real, haríamos promedio de todos los shapes)
            const sampleTrip = trips.find(t => t.route_id === r.route_id);
            if (sampleTrip) {
                const sts = this.stopTimesByTrip.get(sampleTrip.trip_id);
                if (sts && sts.length > 1) {
                    for (let i = 0; i < sts.length - 1; i++) {
                        const s1 = this.stops.get(sts[i].stop_id);
                        const s2 = this.stops.get(sts[i+1].stop_id);
                        if (s1 && s2) {
                            totalDist += this.haversine(s1.stop_lat, s1.stop_lon, s2.stop_lat, s2.stop_lon);
                            segments++;
                        }
                    }
                }
            }

            const avgDist = segments > 0 ? totalDist / segments : 0;
            
            // REGLA DE NEGOCIO: Interurbano si promedio > 5km o total > 10.5km
            r.is_interurban = (avgDist > 5.0) || (totalDist > 10.5);
            r.avg_stop_dist = avgDist;
            
            this.routes.set(r.route_id, r);
        });

        console.timeEnd("loadData");
        console.log(`Datos cargados: ${stops.length} paradas, ${routes.length} rutas.`);
    }

    // --- ALGORITMO A* ---

    /**
     * Encuentra la mejor ruta usando A*.
     * @param {number} originLat 
     * @param {number} originLon 
     * @param {number} destLat 
     * @param {number} destLon 
     * @param {string} startTimeStr "HH:MM:SS"
     * @param {number} dateYYYYMMDD 
     * @param {UserPreferences} prefs 
     */
    findPath(originLat, originLon, destLat, destLon, startTimeStr, dateYYYYMMDD, prefs) {
        const startTimeSec = this.timeToSeconds(startTimeStr);
        const dayOfWeekStr = this.getDayOfWeek(dateYYYYMMDD);

        // 1. Encontrar nodos de inicio
        // Usamos Grid para buscar paradas a distancia caminable
        let startStops = this.findNearbyStops(originLat, originLon, prefs.maxWalkDist / 1000);
        let endStops = this.findNearbyStops(destLat, destLon, prefs.maxWalkDist / 1000);

        // --- FALLBACK MULTIMODAL (Primera Milla) ---
        // Si no hay paradas cerca, buscar HUBS lejanos (ej. 10km) para taxi
        let usedTaxiMode = false;
        if (startStops.length === 0 && prefs.allowTaxi) {
            console.warn("Sin paradas cercanas. Activando modo Taxi/Uber a Hub cercano.");
            // Buscamos paradas en radio de 10km
            startStops = this.findNearbyStops(originLat, originLon, 10.0);
            usedTaxiMode = true;
        }

        if (startStops.length === 0 || endStops.length === 0) {
            return { error: "No se encontraron paradas válidas cerca del origen o destino." };
        }

        // Estructuras A*
        const gScore = new Map(); // Costo mínimo conocido
        const openSet = new MinPriorityQueue();
        const targetStopIds = new Set(endStops.map(e => e.stop.stop_id));

        // Inicializar
        startStops.forEach(startNode => {
            // Calcular costo acceso (Taxi o Caminata)
            let accessDist = startNode.dist; // km
            let accessTime = 0;
            let accessCost = 0;
            let type = 'WALK';

            if (usedTaxiMode && accessDist > (prefs.maxWalkDist / 1000)) {
                type = 'CAR_RIDE_SHARE';
                accessTime = (accessDist * 1000) / this.CAR_SPEED_MPS; 
                accessCost = this.TAXI_BASE_FARE + (accessDist * this.TAXI_KM_FARE); 
            } else {
                accessTime = (accessDist * 1000) / this.WALK_SPEED_MPS;
            }

            const initialG = this.calculateCost(accessTime, accessCost, 0, prefs);
            const arrivalAtStop = startTimeSec + accessTime;
            
            // Heurística (Distancia directa al destino final)
            const h = this.heuristic(startNode.stop.stop_lat, startNode.stop.stop_lon, destLat, destLon);

            // Estado
            const startState = {
                stopId: startNode.stop.stop_id,
                currentTime: arrivalAtStop,
                totalCostMoney: accessCost,
                transfers: 0,
                path: [{
                    type: type,
                    fromStopId: "ORIGIN",
                    toStopId: startNode.stop.stop_id,
                    startTime: startTimeSec,
                    endTime: arrivalAtStop,
                    duration: accessTime,
                    distance: accessDist,
                    cost: accessCost,
                    wait: 0,
                    description: type === 'WALK' ? "Caminar a parada" : "Taxi a estación"
                }],
                gVal: initialG
            };

            gScore.set(startNode.stop.stop_id, initialG);
            openSet.push(startState, initialG + h); // f = g + h
        });

        // Bucle Principal
        while (!openSet.isEmpty()) {
            const current = openSet.pop();
            const { stopId, currentTime, totalCostMoney, transfers, path, gVal } = current;

            // 1. Check Destino
            if (targetStopIds.has(stopId)) {
                const endStopInfo = endStops.find(e => e.stop.stop_id === stopId);
                const walkTime = (endStopInfo.dist * 1000) / this.WALK_SPEED_MPS;
                const finalTime = currentTime + walkTime;
                
                const finalPath = [...path, {
                    type: 'WALK',
                    fromStopId: stopId,
                    toStopId: "DESTINATION",
                    startTime: currentTime,
                    endTime: finalTime,
                    duration: walkTime,
                    distance: endStopInfo.dist,
                    cost: 0,
                    wait: 0,
                    description: "Caminar a destino final"
                }];

                return this.buildResult(finalPath, totalCostMoney, transfers);
            }

            // Poda: Si encontramos un camino mejor antes a este nodo, saltar
            if (gScore.has(stopId) && gScore.get(stopId) < gVal) continue;

            // --- EXPANDIR VECINOS ---

            // A. VIAJES GTFS (Bus/Tren)
            const stopTimes = this.stopTimesByStop.get(stopId) || [];
            
            // Búsqueda Binaria para encontrar primer viaje útil
            const startIndex = this.binarySearchStopTime(stopTimes, currentTime);

            for (let i = startIndex; i < stopTimes.length; i++) {
                const stOrigin = stopTimes[i];

                // Optimización: Si la espera es > 4 horas, asumimos que no es óptimo y cortamos
                // (Excepto en interurbano donde las frecuencias son bajas, podríamos ajustar esto)
                if ((stOrigin.departure_sec - currentTime) > 14400) break;

                // Validar Servicio (Calendario)
                if (!this.isValidService(stOrigin.trip_id, dateYYYYMMDD, dayOfWeekStr)) continue;

                const trip = this.trips.get(stOrigin.trip_id);
                const route = this.routes.get(trip.route_id);

                // Lógica Buffer de Seguridad (Híbrida)
                let minBuffer = 0;
                // Si venimos de otro transporte...
                if (path.length > 0 && path[path.length - 1].type === 'TRANSIT') {
                    // Si la ruta a tomar es Interurbana, buffer grande. Si es urbana, pequeño.
                    minBuffer = route.is_interurban ? 1800 : 300; // 30 min vs 5 min
                }

                if (stOrigin.departure_sec < (currentTime + minBuffer)) continue;

                // Explorar a dónde va este viaje
                const tripStopTimes = this.stopTimesByTrip.get(stOrigin.trip_id);
                
                // Iterar paradas futuras
                // Empezamos desde la posición de esta parada + 1
                const currentSeqIndex = tripStopTimes.findIndex(st => st.stop_sequence === stOrigin.stop_sequence);
                
                for (let j = currentSeqIndex + 1; j < tripStopTimes.length; j++) {
                    const stDest = tripStopTimes[j];
                    
                    // Cálculos
                    const rideTime = stDest.arrival_sec - stOrigin.departure_sec;
                    const waitTime = stOrigin.departure_sec - currentTime;
                    
                    // Tarifa dinámica simulada según tipo de ruta
                    // (Aquí iría la llamada a tabla de fare_attributes si existe)
                    const fare = route.is_interurban ? 15.0 : 2.50; 
                    
                    const newCostG = this.calculateCost(rideTime + waitTime, fare, 1, prefs);
                    const newG = gVal + newCostG;
                    
                    // Heurística al destino final
                    const destStopObj = this.stops.get(stDest.stop_id);
                    const newH = this.heuristic(destStopObj.stop_lat, destStopObj.stop_lon, destLat, destLon);

                    // Relax
                    if (!gScore.has(stDest.stop_id) || newG < gScore.get(stDest.stop_id)) {
                        gScore.set(stDest.stop_id, newG);
                        
                        openSet.push({
                            stopId: stDest.stop_id,
                            currentTime: stDest.arrival_sec,
                            totalCostMoney: totalCostMoney + fare,
                            transfers: transfers + 1,
                            gVal: newG,
                            path: [...path, {
                                type: 'TRANSIT',
                                fromStopId: stopId,
                                toStopId: stDest.stop_id,
                                startTime: stOrigin.departure_sec,
                                endTime: stDest.arrival_sec,
                                duration: rideTime,
                                distance: 0, // Se podría calcular exacto
                                tripId: trip.trip_id,
                                routeId: route.route_id,
                                cost: fare,
                                wait: waitTime,
                                description: `Ruta ${route.route_short_name} (${route.is_interurban ? 'Inter' : 'Urb'})`
                            }]
                        }, newG + newH);
                    }
                }
            }

            // B. CAMINAR (Transbordo a pie)
            // Solo si el último paso no fue caminata
            const lastLeg = path[path.length - 1];
            if (lastLeg.type !== 'WALK' && lastLeg.type !== 'CAR_RIDE_SHARE') {
                const currentStop = this.stops.get(stopId);
                // Buscar vecinos usando Spatial Grid (O(1))
                const neighbors = this.spatialGrid.getNeighbors(currentStop.stop_lat, currentStop.stop_lon);
                
                for (const neighborId of neighbors) {
                    if (neighborId === stopId) continue;
                    
                    const neighbor = this.stops.get(neighborId);
                    const distKm = this.haversine(currentStop.stop_lat, currentStop.stop_lon, neighbor.stop_lat, neighbor.stop_lon);
                    
                    if (distKm <= (prefs.maxWalkDist / 1000)) {
                        const walkTime = (distKm * 1000) / this.WALK_SPEED_MPS;
                        const arrivalTime = currentTime + walkTime;
                        
                        // Costo de caminar (tiempo puro, gratis, sin penalización transfer)
                        const newCostG = this.calculateCost(walkTime, 0, 0, prefs);
                        const newG = gVal + newCostG;

                        if (!gScore.has(neighborId) || newG < gScore.get(neighborId)) {
                            gScore.set(neighborId, newG);
                            
                            openSet.push({
                                stopId: neighborId,
                                currentTime: arrivalTime,
                                totalCostMoney: totalCostMoney,
                                transfers: transfers,
                                gVal: newG,
                                path: [...path, {
                                    type: 'WALK',
                                    fromStopId: stopId,
                                    toStopId: neighborId,
                                    startTime: currentTime,
                                    endTime: arrivalTime,
                                    duration: walkTime,
                                    distance: distKm,
                                    cost: 0,
                                    wait: 0,
                                    description: `Caminar a ${neighbor.stop_name}`
                                }]
                            }, newG + this.heuristic(neighbor.stop_lat, neighbor.stop_lon, destLat, destLon));
                        }
                    }
                }
            }
        }

        return null; // No path found
    }

    // --- HELPERS ---

    /**
     * Búsqueda Binaria O(log N)
     * Encuentra índice del primer stop_time tal que departure >= targetTime
     */
    binarySearchStopTime(times, targetTime) {
        let low = 0, high = times.length - 1, ans = times.length;
        while (low <= high) {
            let mid = Math.floor((low + high) / 2);
            if (times[mid].departure_sec >= targetTime) {
                ans = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        return ans;
    }

    /**
     * Heurística Admisible (Optimista)
     * Distancia Euclidiana / Velocidad Máxima del Sistema
     */
    heuristic(lat1, lon1, lat2, lon2) {
        const distM = this.haversine(lat1, lon1, lat2, lon2) * 1000;
        return distM / this.MAX_TRANSIT_SPEED_MPS;
    }

    /**
     * Función de Costo Ponderada
     */
    calculateCost(timeSeconds, money, transfers, prefs) {
        return (timeSeconds * prefs.weightTime) + 
               (money * prefs.weightCost) + 
               (transfers * prefs.weightTransfers);
    }

    findNearbyStops(lat, lon, radiusKm) {
        const candidates = this.spatialGrid.getNeighbors(lat, lon);
        const result = [];
        candidates.forEach(id => {
            const s = this.stops.get(id);
            const d = this.haversine(lat, lon, s.stop_lat, s.stop_lon);
            if (d <= radiusKm) result.push({ stop: s, dist: d });
        });
        return result.sort((a,b) => a.dist - b.dist);
    }

    isValidService(tripId, date, dayName) {
        const trip = this.trips.get(tripId);
        if (!trip) return false;
        const cal = this.calendars.get(trip.service_id);
        if (!cal) return false;
        return (date >= cal.start_date && date <= cal.end_date && cal[dayName] === 1);
    }

    // --- UTILS ---

    haversine(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const [h, m, s] = timeStr.split(':').map(Number);
        return (h * 3600) + (m * 60) + (s || 0);
    }

    secondsToTime(secs) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    getDayOfWeek(dateNum) {
        const s = dateNum.toString();
        const d = new Date(s.substring(0,4), parseInt(s.substring(4,6))-1, s.substring(6,8));
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        return days[d.getDay()];
    }

    buildResult(path, totalCost, transfers) {
        return {
            segments: path,
            departureTime: this.secondsToTime(path[0].startTime),
            arrivalTime: this.secondsToTime(path[path.length-1].endTime),
            totalTimeSeconds: path[path.length-1].endTime - path[0].startTime,
            totalMoney: totalCost,
            transfers: transfers
        };
    }
}

// Exponer globalmente
window.TransitEngine = TransitEngine;