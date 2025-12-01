/**
 * algoritmo.js
 * Algoritmo de planificación de rutas de transporte público (GTFS)
 * Versión 2.0: Soporte para Geolocalización (Lat/Lon) y Trazado de Mapas.
 */

class MinPriorityQueue {
    constructor() {
        this.heap = [];
    }

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
        let length = this.heap.length;
        let element = this.heap[n];
        let swap = null;

        while (true) {
            let child2N = (n + 1) * 2;
            let child1N = child2N - 1;
            swap = null;

            if (child1N < length) {
                let child1 = this.heap[child1N];
                if (child1.priority < element.priority) {
                    swap = child1N;
                }
            }

            if (child2N < length) {
                let child2 = this.heap[child2N];
                let child1Priority = (swap === null) ? element.priority : this.heap[child1N].priority;
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

class TransportePlanificador {
    constructor(db) {
        this.db = db;
        this.MAX_WALK_DISTANCE_KM = 2.0; // Distancia máxima para caminar hacia/desde una parada
        this.WALK_SPEED_MPS = 1.1; // ~4km/h
    }

    /**
     * Busca una ruta entre dos puntos que pueden ser IDs de parada o Coordenadas {lat, lon}.
     */
    buscarRutaAvanzada(origen, destino, fechaYYYYMMDD, horaInicioSegundos, diaSemanaField) {
        // 1. Identificar Puntos de Inicio y Fin (Paradas candidatas)
        let nodosInicio = []; // [{ stopId, walkTime, dist }]
        let nodosFin = [];    // [{ stopId, walkTime, dist }]

        // Procesar Origen
        if (typeof origen === 'object' && origen.lat && origen.lon) {
            // Es coordenada: buscar paradas cercanas
            const cercanas = this.buscarParadasCercanasGlobal(origen.lat, origen.lon);
            if (cercanas.length === 0) return { error: "No hay paradas cerca del origen." };
            
            cercanas.forEach(p => {
                const walkTime = Math.ceil((p.dist * 1000) / this.WALK_SPEED_MPS);
                nodosInicio.push({ 
                    stopId: p.stop_id, 
                    walkTime: walkTime, 
                    dist: p.dist,
                    startLat: origen.lat,
                    startLon: origen.lon
                });
            });
        } else {
            // Es ID de parada
            nodosInicio.push({ stopId: origen, walkTime: 0, dist: 0 });
        }

        // Procesar Destino
        let destinoEsCoordenada = false;
        let destLat, destLon;
        if (typeof destino === 'object' && destino.lat && destino.lon) {
            destinoEsCoordenada = true;
            destLat = destino.lat;
            destLon = destino.lon;
            const cercanas = this.buscarParadasCercanasGlobal(destino.lat, destino.lon);
            if (cercanas.length === 0) return { error: "No hay paradas cerca del destino." };

            cercanas.forEach(p => {
                const walkTime = Math.ceil((p.dist * 1000) / this.WALK_SPEED_MPS);
                nodosFin.push({ stopId: p.stop_id, walkTime: walkTime, dist: p.dist });
            });
        } else {
            nodosFin.push({ stopId: destino, walkTime: 0, dist: 0 });
        }

        // Mapa rápido de destinos aceptables para chequear condición de parada
        const destinosMap = new Map();
        nodosFin.forEach(n => destinosMap.set(n.stopId, n));

        // 2. Inicializar Dijkstra
        const bestTimes = new Map();
        const pq = new MinPriorityQueue();

        // Insertar todos los nodos de inicio posibles
        nodosInicio.forEach(startNode => {
            const initialTime = horaInicioSegundos + startNode.walkTime;
            bestTimes.set(startNode.stopId, initialTime);
            
            // Path inicial puede incluir caminata
            const initialPath = [];
            if (startNode.walkTime > 0) {
                initialPath.push({
                    type: 'walk_start',
                    fromCoords: { lat: startNode.startLat, lon: startNode.startLon },
                    toStop: startNode.stopId,
                    duration: startNode.walkTime,
                    distance: startNode.dist,
                    startTime: horaInicioSegundos,
                    endTime: initialTime
                });
            }

            pq.push({
                stopId: startNode.stopId,
                currentTime: initialTime,
                path: initialPath,
                cost: 0,
                transfers: 0
            }, initialTime);
        });

        let mejorRutaGlobal = null;

        // 3. Bucle Principal
        while (!pq.isEmpty()) {
            const current = pq.pop();
            const { stopId, currentTime, path, cost, transfers } = current;

            // Poda
            if (bestTimes.has(stopId) && bestTimes.get(stopId) < currentTime) continue;

            // A. ¿Hemos llegado a un nodo destino?
            if (destinosMap.has(stopId)) {
                const finalLeg = destinosMap.get(stopId);
                const finalTime = currentTime + finalLeg.walkTime;
                
                // Construir candidato de solución
                const rutaCompleta = {
                    ...current,
                    currentTime: finalTime,
                    finalWalk: finalLeg.walkTime > 0 ? {
                        type: 'walk_end',
                        fromStop: stopId,
                        toCoords: { lat: destLat, lon: destLon },
                        duration: finalLeg.walkTime,
                        distance: finalLeg.dist,
                        startTime: currentTime,
                        endTime: finalTime
                    } : null
                };

                // Si encontramos uno, devolvemos inmediatamente (Dijkstra garantiza optimo en tiempo)
                // Para una implementación más robusta con "walk", a veces se espera un poco, 
                // pero asumiremos que el primer hit es el mejor.
                return this.construirResultado(rutaCompleta);
            }

            // B. Transbordos a Pie (Cercanos)
            const paradasCercanas = this.obtenerParadasCercanas(stopId);
            for (const p of paradasCercanas) {
                const walkTime = Math.ceil((p.distanceKm * 1000) / this.WALK_SPEED_MPS);
                const arrivalTime = currentTime + walkTime;

                if (!bestTimes.has(p.id) || arrivalTime < bestTimes.get(p.id)) {
                    bestTimes.set(p.id, arrivalTime);
                    pq.push({
                        stopId: p.id,
                        currentTime: arrivalTime,
                        path: [...path, {
                            type: 'walk_transfer',
                            from: stopId, to: p.id,
                            duration: walkTime,
                            startTime: currentTime, endTime: arrivalTime,
                            distance: p.distanceKm
                        }],
                        cost: cost,
                        transfers: transfers
                    }, arrivalTime);
                }
            }

            // C. Viajes en Transporte (GTFS)
            const viajesPosibles = this.obtenerViajesDesdeParada(stopId, currentTime, fechaYYYYMMDD, diaSemanaField);
            for (const viaje of viajesPosibles) {
                if (!bestTimes.has(viaje.stopDestino) || viaje.arrivalTimeDestino < bestTimes.get(viaje.stopDestino)) {
                    bestTimes.set(viaje.stopDestino, viaje.arrivalTimeDestino);
                    pq.push({
                        stopId: viaje.stopDestino,
                        currentTime: viaje.arrivalTimeDestino,
                        path: [...path, {
                            type: 'transit',
                            from: stopId, to: viaje.stopDestino,
                            trip: viaje.trip, route: viaje.route,
                            startTime: viaje.departureTime,
                            endTime: viaje.arrivalTimeDestino,
                            wait: viaje.departureTime - currentTime,
                            // Datos para dibujar mapa:
                            fromSeq: viaje.fromSeq,
                            toSeq: viaje.toSeq
                        }],
                        cost: cost + (viaje.fare || 0),
                        transfers: transfers + 1
                    }, viaje.arrivalTimeDestino);
                }
            }
        }

        return null;
    }

    /**
     * Busca paradas en toda la DB cercanas a una lat/lon arbitraria.
     */
    buscarParadasCercanasGlobal(lat, lon) {
        const candidatas = [];
        this.db.paradasPrincipales.forEach(stop => {
            const dist = this.getDistanciaHaversine(lat, lon, stop.stop_lat, stop.stop_lon);
            if (dist <= this.MAX_WALK_DISTANCE_KM) {
                candidatas.push({ ...stop, dist });
            }
        });
        return candidatas.sort((a, b) => a.dist - b.dist).slice(0, 5); // Retornar las 5 más cercanas
    }

    obtenerParadasCercanas(currentStopId) {
        // Misma lógica de antes para transbordos
        const vecinos = [];
        const currentStop = this.db.stops.get(currentStopId);
        if (!currentStop) return [];
        // Optimización simple: solo buscar si no tenemos precalculado
        this.db.paradasPrincipales.forEach(targetStop => {
            if (targetStop.stop_id === currentStopId) return;
            const dist = this.getDistanciaHaversine(currentStop.stop_lat, currentStop.stop_lon, targetStop.stop_lat, targetStop.stop_lon);
            if (dist <= 0.5) { // 500 metros para transbordo interno
                vecinos.push({ id: targetStop.stop_id, distanceKm: dist });
            }
        });
        return vecinos;
    }

    obtenerViajesDesdeParada(stopId, minTime, fecha, diaSemana) {
        const opciones = [];
        const andenes = this.db.paradasPadreHijas.get(stopId) || [stopId];
        let salidas = [];
        andenes.forEach(andenId => {
            const st = this.db.stopTimesPorParada.get(andenId);
            if (st) salidas = salidas.concat(st);
        });

        for (const stOrigen of salidas) {
            if (!this.esServicioValido(stOrigen.trip_id, fecha, diaSemana)) continue;

            const trip = this.db.trips.get(stOrigen.trip_id);
            const route = this.db.routes.get(trip.route_id);
            const tarifaInfo = this.db.tarifas.get(route.route_id);
            const fare = tarifaInfo ? tarifaInfo.num : 0;
            const freqs = this.db.frequencies.get(stOrigen.trip_id);

            let departureTimeSecs = -1;

            if (freqs && freqs.length > 0) {
                // Lógica Frecuencia
                const stInicial = this.db.stopTimes.find(s => s.trip_id === stOrigen.trip_id && s.stop_sequence === 1);
                const offset = this.aSegundos(stOrigen.departure_time) - this.aSegundos(stInicial.departure_time);
                for (const freq of freqs) {
                    const startService = this.aSegundos(freq.start_time);
                    const endService = this.aSegundos(freq.end_time);
                    const headway = freq.headway_secs;
                    let t = startService;
                    while ((t + offset) < minTime && t < endService) t += headway;
                    if ((t + offset) >= minTime && t < endService) {
                        departureTimeSecs = t + offset;
                        break;
                    }
                }
            } else {
                // Horario Fijo
                const dep = this.aSegundos(stOrigen.departure_time);
                if (dep >= minTime) departureTimeSecs = dep;
            }

            if (departureTimeSecs !== -1) {
                const paradasPosteriores = this.db.stopTimes.filter(st => 
                    st.trip_id === stOrigen.trip_id && 
                    st.stop_sequence > stOrigen.stop_sequence
                );

                for (const stDestino of paradasPosteriores) {
                    let arrivalTimeSecs = 0;
                    if (freqs && freqs.length > 0) {
                         const diff = this.aSegundos(stDestino.arrival_time) - this.aSegundos(stOrigen.departure_time);
                         arrivalTimeSecs = departureTimeSecs + diff;
                    } else {
                        arrivalTimeSecs = this.aSegundos(stDestino.arrival_time);
                    }

                    const stopDestinoObj = this.db.stops.get(stDestino.stop_id);
                    const stopDestinoMainId = (stopDestinoObj.location_type === 0 && stopDestinoObj.parent_station) 
                        ? stopDestinoObj.parent_station 
                        : stDestino.stop_id;

                    opciones.push({
                        trip: trip,
                        route: route,
                        stopDestino: stopDestinoMainId,
                        departureTime: departureTimeSecs,
                        arrivalTimeDestino: arrivalTimeSecs,
                        fare: fare,
                        // Guardamos secuencias para poder dibujar el tramo exacto del shape luego
                        fromSeq: stOrigen.stop_sequence,
                        toSeq: stDestino.stop_sequence
                    });
                }
            }
        }
        return opciones;
    }

    esServicioValido(tripId, fechaNum, diaSemanaStr) {
        const trip = this.db.trips.get(tripId);
        if (!trip) return false;
        const cal = this.db.calendar.get(trip.service_id);
        if (!cal) return false;
        if (fechaNum < cal.start_date || fechaNum > cal.end_date) return false;
        if (cal[diaSemanaStr] !== 1) return false;
        return true;
    }

    construirResultado(finalNode) {
        const pasos = [];
        let totalFare = 0;
        let monedas = new Set();
        let pathCompleto = [...finalNode.path];

        // Agregar caminata final si existe
        if (finalNode.finalWalk) {
            pathCompleto.push(finalNode.finalWalk);
        }

        pathCompleto.forEach(segment => {
            if (segment.type === 'walk_start' || segment.type === 'walk_end' || segment.type === 'walk_transfer') {
                let nombreOrigen, nombreDestino;
                
                // Resolver nombres
                if (segment.fromCoords) nombreOrigen = "Tu ubicación / Punto en mapa";
                else nombreOrigen = this.db.stops.get(segment.from || segment.fromStop).stop_name;

                if (segment.toCoords) nombreDestino = "Destino seleccionado";
                else nombreDestino = this.db.stops.get(segment.to || segment.toStop).stop_name;
                
                // Generar geometría simple (Línea recta) para caminatas
                let lat1, lon1, lat2, lon2;
                if (segment.fromCoords) { lat1 = segment.fromCoords.lat; lon1 = segment.fromCoords.lon; }
                else { const s = this.db.stops.get(segment.from || segment.fromStop); lat1 = s.stop_lat; lon1 = s.stop_lon; }

                if (segment.toCoords) { lat2 = segment.toCoords.lat; lon2 = segment.toCoords.lon; }
                else { const s = this.db.stops.get(segment.to || segment.toStop); lat2 = s.stop_lat; lon2 = s.stop_lon; }

                pasos.push({
                    tipo: 'caminata',
                    origen: nombreOrigen,
                    destino: nombreDestino,
                    horaSalida: this.segundosAHora(segment.startTime),
                    horaLlegada: this.segundosAHora(segment.endTime),
                    duracion: this.segundosAFormato(segment.duration),
                    distancia: segment.distance.toFixed(2) + ' km',
                    instruccion: `Camina ${segment.distance.toFixed(2)} km`,
                    geometria: [[lat1, lon1], [lat2, lon2]] // Línea recta
                });

            } else if (segment.type === 'transit') {
                const tarifaInfo = this.db.tarifas.get(segment.route.route_id);
                const precio = tarifaInfo ? tarifaInfo.num : 0;
                const moneda = tarifaInfo ? tarifaInfo.moneda : 'Bs.';
                totalFare += precio;
                monedas.add(moneda);

                // EXTRAER GEOMETRÍA DEL SHAPE
                let geometria = [];
                if (segment.trip.shape_id && this.db.shapes.has(segment.trip.shape_id)) {
                    // Intento de obtener tramo exacto: 
                    // GTFS simple no mapea sequence de stop a sequence de shape directamente sin dist_traveled.
                    // APROXIMACIÓN: Obtener Lat/Lon de StopOrigen y StopDestino
                    // Filtrar puntos del shape que estén "entre" esos dos puntos geográficamente 
                    // (Esto es complejo y propenso a error sin shape_dist_traveled).
                    // SOLUCIÓN PRÁCTICA MVP: Devolver todo el shape del trip o simplemente línea recta si no se quiere procesar tanto.
                    // MEJORA: Usaremos la lista completa del shape del trip por ahora, Leaflet puede hacer zoom.
                    // O MEJOR: Recortar buscando el punto del shape más cercano a la parada de origen y destino.
                    
                    const fullShape = this.db.shapes.get(segment.trip.shape_id);
                    const stopOrigen = this.db.stops.get(segment.from);
                    const stopDestino = this.db.stops.get(segment.to);
                    
                    // Encontrar índices aproximados en el array del shape
                    let idxInicio = this.findClosestPointIndex(fullShape, stopOrigen.stop_lat, stopOrigen.stop_lon);
                    let idxFin = this.findClosestPointIndex(fullShape, stopDestino.stop_lat, stopDestino.stop_lon);
                    
                    if (idxInicio > idxFin) [idxInicio, idxFin] = [idxFin, idxInicio]; // Safety
                    
                    geometria = fullShape.slice(idxInicio, idxFin + 1).map(p => [p.shape_pt_lat, p.shape_pt_lon]);
                }

                pasos.push({
                    tipo: 'transporte',
                    route: segment.route,
                    trip: segment.trip,
                    origen: this.db.stops.get(segment.from).stop_name,
                    destino: this.db.stops.get(segment.to).stop_name,
                    horaSalida: this.segundosAHora(segment.startTime),
                    horaLlegada: this.segundosAHora(segment.endTime),
                    duracion: this.segundosAFormato(segment.endTime - segment.startTime),
                    espera: this.segundosAFormato(segment.wait),
                    precio: `${precio} ${moneda}`,
                    instruccion: `Toma la ruta ${segment.route.route_short_name} hacia ${segment.trip.trip_headsign}`,
                    geometria: geometria
                });
            }
        });

        return {
            pasos: pasos,
            horaLlegada: this.segundosAHora(finalNode.currentTime),
            horaSalida: this.segundosAHora(pathCompleto[0].startTime),
            duracionTotal: this.segundosAFormato(finalNode.currentTime - pathCompleto[0].startTime),
            costoTotal: totalFare > 0 ? `${totalFare.toFixed(2)} ${[...monedas].join('/')}` : "Gratis / Desconocido",
            transbordos: finalNode.transfers
        };
    }

    findClosestPointIndex(shapePoints, lat, lon) {
        let minDest = Infinity;
        let idx = 0;
        for (let i = 0; i < shapePoints.length; i++) {
            const d = (shapePoints[i].shape_pt_lat - lat)**2 + (shapePoints[i].shape_pt_lon - lon)**2;
            if (d < minDest) {
                minDest = d;
                idx = i;
            }
        }
        return idx;
    }

    // --- UTILIDADES ---
    aSegundos(horaStr) {
        if (!horaStr) return 0;
        const [h, m, s] = horaStr.split(':').map(Number);
        return (h * 3600) + (m * 60) + (s || 0);
    }

    segundosAHora(seg) {
        let h = Math.floor(seg / 3600);
        let m = Math.floor((seg % 3600) / 60);
        let s = Math.floor(seg % 60);
        return [h.toString().padStart(2, '0'), m.toString().padStart(2, '0'), s.toString().padStart(2, '0')].join(':');
    }

    segundosAFormato(seg) {
        if (seg < 60) return `${seg} seg`;
        const h = Math.floor(seg / 3600);
        const m = Math.floor((seg % 3600) / 60);
        if (h > 0) return `${h}h ${m}min`;
        return `${m} min`;
    }

    getDistanciaHaversine(lat1, lon1, lat2, lon2) {
        const toRad = x => x * Math.PI / 180;
        const R = 6371; 
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}

window.TransportePlanificador = TransportePlanificador;