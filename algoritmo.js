/**
 * MOTOR DE ENRUTAMIENTO DE TRANSPORTE PÚBLICO (CLIENT-SIDE)
 * Simula la lógica de OpenTripPlanner usando Dijkstra/CSA.
 */

class PriorityQueue {
    constructor() { this.values = []; }
    enqueue(val, priority) {
        this.values.push({ val, priority });
        this.sort();
    }
    dequeue() { return this.values.shift(); }
    sort() { this.values.sort((a, b) => a.priority - b.priority); }
    isEmpty() { return this.values.length === 0; }
}

class TransitRouter {
    constructor(db) {
        this.db = db;
        this.transfers = new Map(); // Mapa de caminatas posibles entre paradas
        this.stopTimesIndex = new Map(); // Índice rápido de horarios
        
        // Configuración del algoritmo
        this.CONFIG = {
            WALK_SPEED: 1.1, // metros por segundo (~4 km/h)
            MAX_WALK_DIST: 200000, // metros máximos totales caminando
            TRANSFER_PENALTY: 300, // 5 minutos de "castigo" por hacer transbordo (evita transbordos innecesarios)
            MAX_SEARCH_TIME: 20000 // 2 horas ventana de búsqueda
        };

        this.inicializarIndices();
    }

    /**
     * Pre-calcula conexiones a pie y organiza horarios
     */
    inicializarIndices() {
        console.time("Inicializando Router");

        // 1. Indexar StopTimes por Parada (Ordenados por tiempo)
        // Esto evita recorrer todo el array gigante en cada búsqueda
        this.db.stopTimes.forEach(st => {
            if (!this.stopTimesIndex.has(st.stop_id)) {
                this.stopTimesIndex.set(st.stop_id, []);
            }
            this.stopTimesIndex.get(st.stop_id).push(st);
        });

        // Ordenar cronológicamente cada lista de paradas
        this.stopTimesIndex.forEach(lista => {
            lista.sort((a, b) => this._timeToSeconds(a.departure_time) - this._timeToSeconds(b.departure_time));
        });

        // 2. Generar Grafo de Transbordos (Caminatas entre paradas cercanas)
        const stops = [...this.db.paradasPrincipales.values()];
        const RADIO_TRANSBORDO = 0.5; // km (500 metros para cambiar de bus)

        stops.forEach(s1 => {
            const vecinos = [];
            stops.forEach(s2 => {
                if (s1.stop_id === s2.stop_id) return;
                // Filtro rápido lat/lon (aprox 0.01 grados ~ 1km)
                if (Math.abs(s1.stop_lat - s2.stop_lat) > 0.01) return;
                
                const dist = this._getDistancia(s1.stop_lat, s1.stop_lon, s2.stop_lat, s2.stop_lon);
                if (dist <= RADIO_TRANSBORDO) {
                    vecinos.push({
                        id: s2.stop_id,
                        dist: dist * 1000, // a metros
                        time: (dist * 1000) / this.CONFIG.WALK_SPEED
                    });
                }
            });
            if (vecinos.length > 0) this.transfers.set(s1.stop_id, vecinos);
        });

        console.timeEnd("Inicializando Router");
        console.log(`Router listo: ${this.transfers.size} nodos de transferencia generados.`);
    }

    /**
     * BUSCAR RUTA (Algoritmo Principal)
     * @param {number} latOrigen 
     * @param {number} lonOrigen 
     * @param {number} latDestino 
     * @param {number} lonDestino 
     * @param {Date} fechaHoraSalida 
     */
    async findRoute(latOrigen, lonOrigen, latDestino, lonDestino, fechaHoraSalida) {
        const startTime = this._dateToSeconds(fechaHoraSalida);
        const dayService = this._getDayServiceId(fechaHoraSalida);
        const dateInt = this._getDateInt(fechaHoraSalida);

        // 1. Encontrar paradas candidatas de inicio y fin
        const startStops = this._findNearbyStops(latOrigen, lonOrigen, 1000); // 1km radio
        const endStops = this._findNearbyStops(latDestino, lonDestino, 1000);

        if (startStops.length === 0 || endStops.length === 0) {
            throw new Error("No hay paradas cercanas al origen o destino.");
        }

        // Dijkstra Setup
        const pq = new PriorityQueue();
        const minTimes = new Map(); // stop_id -> tiempo llegada mínimo
        
        // Inicializar cola con caminatas desde el Origen -> Paradas cercanas
        startStops.forEach(st => {
            const walkTime = st.dist / this.CONFIG.WALK_SPEED;
            const arrivalTime = startTime + walkTime;
            
            const state = {
                stop_id: st.stop.stop_id,
                time: arrivalTime,
                legs: [{
                    type: 'WALK',
                    from: { name: 'Mi Ubicación', lat: latOrigen, lon: lonOrigen },
                    to: { name: st.stop.stop_name, lat: st.stop.stop_lat, lon: st.stop.stop_lon },
                    startTime: startTime,
                    endTime: arrivalTime,
                    duration: walkTime,
                    distance: st.dist
                }],
                cost: walkTime // El costo inicial es solo el tiempo caminando
            };
            
            pq.enqueue(state, arrivalTime);
            minTimes.set(st.stop.stop_id, arrivalTime);
        });

        const solutions = [];
        let iterations = 0;
        const MAX_ITERATIONS = 10000; // Seguridad para evitar cuelgues

        while (!pq.isEmpty() && iterations < MAX_ITERATIONS) {
            iterations++;
            const current = pq.dequeue().val;

            // Poda: Si ya llegamos a esta parada antes más rápido, ignorar
            if (minTimes.has(current.stop_id) && minTimes.get(current.stop_id) < current.time) continue;

            // A. CHECK DE ÉXITO: ¿Podemos caminar al destino final desde aquí?
            const currentStop = this.db.stops.get(current.stop_id);
            const distToDest = this._getDistancia(currentStop.stop_lat, currentStop.stop_lon, latDestino, lonDestino) * 1000;

            if (distToDest < 1500) { // Si estamos a menos de 1.5km del destino
                const walkTimeEnd = distToDest / this.CONFIG.WALK_SPEED;
                const finalTime = current.time + walkTimeEnd;
                
                solutions.push({
                    arrivalTime: finalTime,
                    duration: finalTime - startTime,
                    legs: [...current.legs, {
                        type: 'WALK',
                        from: { name: currentStop.stop_name, lat: currentStop.stop_lat, lon: currentStop.stop_lon },
                        to: { name: 'Destino Final', lat: latDestino, lon: lonDestino },
                        startTime: current.time,
                        endTime: finalTime,
                        duration: walkTimeEnd,
                        distance: distToDest
                    }]
                });
                
                // Si encontramos 3 rutas buenas, paramos para no saturar
                if (solutions.length >= 3) break;
            }

            // B. EXPLORAR BUSES (Trips)
            const potentialTrips = this.stopTimesIndex.get(current.stop_id) || [];
            
            // Buscar el siguiente horario válido (Búsqueda lineal optimizada por estar ordenado)
            for (const st of potentialTrips) {
                const depTime = this._timeToSeconds(st.departure_time);
                
                // Solo futuros cercanos
                if (depTime < current.time) continue; 
                if (depTime > current.time + this.CONFIG.MAX_SEARCH_TIME) break; // Ya son muy tarde

                // Validar Calendario
                if (!this._isValidService(st.trip_id, dayService, dateInt)) continue;

                // Encontramos un bus que sirve. Ahora, ¿a dónde va?
                const tripStops = this.db.tripStopTimesMap.get(st.trip_id);
                if (!tripStops) continue;

                const tripInfo = this.db.trips.get(st.trip_id);
                const routeInfo = this.db.routes.get(tripInfo.route_id);
                const tarifaInfo = this.db.tarifas.get(routeInfo.route_id);

                // Recorrer paradas RESTANTES del viaje
                for (let i = 0; i < tripStops.length; i++) {
                    const nextSt = tripStops[i];
                    if (nextSt.stop_sequence <= st.stop_sequence) continue; // Es parada anterior

                    const arrTime = this._timeToSeconds(nextSt.arrival_time);
                    
                    // Costo: Tiempo real + Penalización por esperar
                    const waitTime = depTime - current.time;
                    const travelTime = arrTime - depTime;
                    const newCost = current.cost + waitTime + travelTime;

                    if (!minTimes.has(nextSt.stop_id) || minTimes.get(nextSt.stop_id) > arrTime) {
                        minTimes.set(nextSt.stop_id, arrTime);
                        
                        pq.enqueue({
                            stop_id: nextSt.stop_id,
                            time: arrTime,
                            legs: [...current.legs, {
                                type: 'BUS',
                                route: routeInfo,
                                trip: tripInfo,
                                from: { name: currentStop.stop_name },
                                to: { name: this.db.stops.get(nextSt.stop_id).stop_name },
                                startTime: depTime,
                                endTime: arrTime,
                                waitTime: waitTime,
                                duration: travelTime,
                                tarifa: tarifaInfo
                            }],
                            cost: newCost
                        }, newCost); // Prioridad basada en costo compuesto, no solo tiempo
                    }
                }
            }

            // C. EXPLORAR TRANSBORDOS (Walk Transfers)
            const neighbors = this.transfers.get(current.stop_id);
            if (neighbors) {
                for (const nb of neighbors) {
                    const arrivalNb = current.time + nb.time;
                    const newCost = current.cost + nb.time + this.CONFIG.TRANSFER_PENALTY;

                    if (!minTimes.has(nb.id) || minTimes.get(nb.id) > arrivalNb) {
                        minTimes.set(nb.id, arrivalNb);
                        pq.enqueue({
                            stop_id: nb.id,
                            time: arrivalNb,
                            legs: [...current.legs, {
                                type: 'WALK',
                                isTransfer: true,
                                from: { name: currentStop.stop_name },
                                to: { name: this.db.stops.get(nb.id).stop_name },
                                startTime: current.time,
                                endTime: arrivalNb,
                                duration: nb.time,
                                distance: nb.dist
                            }],
                            cost: newCost
                        }, newCost);
                    }
                }
            }
        }
        
        return solutions.sort((a,b) => a.duration - b.duration);
    }

    // --- UTILIDADES ---

    _findNearbyStops(lat, lon, radioMeters) {
        const radioKm = radioMeters / 1000;
        return [...this.db.paradasPrincipales.values()].map(st => {
            const d = this._getDistancia(lat, lon, st.stop_lat, st.stop_lon);
            return { stop: st, dist: d * 1000 }; // dist en metros
        }).filter(x => x.dist <= radioMeters).sort((a,b) => a.dist - b.dist).slice(0, 5); // Retornar las 5 más cercanas
    }

    _isValidService(tripId, dayService, dateInt) {
        const trip = this.db.trips.get(tripId);
        if (!trip) return false;
        const cal = this.db.calendar.get(trip.service_id);
        if (!cal) return false;
        if (cal[dayService] !== 1) return false;
        if (dateInt < cal.start_date || dateInt > cal.end_date) return false;
        return true;
    }

    _getDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radio tierra km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distancia en KM
    }

    _timeToSeconds(timeStr) {
        if(!timeStr) return 999999;
        const [h, m, s] = timeStr.split(':').map(Number);
        return h * 3600 + m * 60 + s;
    }

    _dateToSeconds(date) {
        return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    }

    _getDayServiceId(date) {
        const dias = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        return dias[date.getDay()];
    }

    _getDateInt(date) {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return parseInt(`${y}${m}${d}`, 10);
    }
}