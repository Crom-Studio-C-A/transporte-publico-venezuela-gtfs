/**
 * algoritmo.js
 * Algoritmo de planificación de rutas de transporte público (GTFS)
 * Utiliza una adaptación del algoritmo de Dijkstra dependiente del tiempo.
 * * Soporta:
 * - Múltiples transbordos (sin límite fijo).
 * - Caminatas entre paradas (transbordos a pie).
 * - Cálculo de tarifas.
 * - Rutas basadas en Frecuencia y Horarios fijos.
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
        // Configuración "sin limites" como pediste, pero con valores sanos para evitar bucles infinitos
        this.MAX_WALK_DISTANCE_KM = 5.0; // Caminata máxima permitida entre paradas (5km es bastante)
        this.WALK_SPEED_MPS = 1.1; // Velocidad promedio caminando (metros por segundo) ~4km/h
        this.TRANSFER_PENALTY_SECONDS = 60; // Penalización pequeña para preferir rutas con menos transbordos si el tiempo es igual
    }

    /**
     * Función principal para buscar ruta
     */
    buscarRuta(origenId, destinoId, fechaYYYYMMDD, horaInicioSegundos, diaSemanaField) {
        // 1. Validaciones iniciales
        if (!origenId || !destinoId) return null;
        
        // Convertir IDs de inputs a IDs de paradas principales si es necesario
        // (Asumimos que el input ya viene limpio, pero por si acaso usamos el mapeo de la DB)
        
        // 2. Estructuras para Dijkstra
        // bestTimes: Map<StopId, segundosLlegada>
        const bestTimes = new Map();
        
        // Cola de prioridad: almacena estados { stopId, currentTime, path, totalCost }
        // Prioridad: currentTime (queremos llegar lo antes posible)
        const pq = new MinPriorityQueue();

        // Estado inicial
        pq.push({
            stopId: origenId,
            currentTime: horaInicioSegundos,
            path: [], // Historial de tramos
            cost: 0,   // Costo monetario acumulado
            transfers: 0
        }, horaInicioSegundos);

        bestTimes.set(origenId, horaInicioSegundos);

        let mejorRutaEncontrada = null;

        // 3. Bucle Principal
        while (!pq.isEmpty()) {
            const current = pq.pop();
            const { stopId, currentTime, path, cost, transfers } = current;

            // Si llegamos al destino, verificamos si es la mejor ruta hasta ahora
            // Nota: Como usamos Dijkstra por tiempo, la primera vez que sacamos el destino de la cola
            // es garantizado que es la ruta más rápida.
            if (stopId === destinoId) {
                return this.construirResultado(current);
            }

            // Poda: Si ya hemos llegado a esta parada antes en un tiempo menor, descartar este camino
            if (bestTimes.has(stopId) && bestTimes.get(stopId) < currentTime) {
                continue;
            }

            // --- A. MOVERSE CAMINANDO A PARADAS CERCANAS (Transbordo a pie) ---
            // Obtenemos paradas cercanas
            const paradasCercanas = this.obtenerParadasCercanas(stopId);
            
            for (const p of paradasCercanas) {
                const walkTime = Math.ceil((p.distanceKm * 1000) / this.WALK_SPEED_MPS);
                const arrivalTime = currentTime + walkTime;

                // Si mejora el tiempo de llegada a esa parada vecina
                if (!bestTimes.has(p.id) || arrivalTime < bestTimes.get(p.id)) {
                    bestTimes.set(p.id, arrivalTime);
                    
                    const newPath = [...path, {
                        type: 'walk',
                        from: stopId,
                        to: p.id,
                        duration: walkTime,
                        startTime: currentTime,
                        endTime: arrivalTime,
                        distance: p.distanceKm
                    }];

                    pq.push({
                        stopId: p.id,
                        currentTime: arrivalTime,
                        path: newPath,
                        cost: cost,
                        transfers: transfers // Caminar no cuenta como transbordo de vehículo
                    }, arrivalTime);
                }
            }

            // --- B. TOMAR UN TRANSPORTE DESDE AQUÍ ---
            // Buscamos viajes que pasen por esta parada y salgan DESPUÉS de currentTime
            const viajesPosibles = this.obtenerViajesDesdeParada(stopId, currentTime, fechaYYYYMMDD, diaSemanaField);

            for (const viaje of viajesPosibles) {
                // viaje tiene: trip_id, departure_time (segundos), arrival_time_destino (segundos), stop_destino, route, cost
                
                // Si mejora el tiempo a la parada destino de este tramo
                if (!bestTimes.has(viaje.stopDestino) || viaje.arrivalTimeDestino < bestTimes.get(viaje.stopDestino)) {
                    
                    // Solo actualizamos si es significativamente mejor o es nuevo
                    bestTimes.set(viaje.stopDestino, viaje.arrivalTimeDestino);

                    const newPath = [...path, {
                        type: 'transit',
                        from: stopId,
                        to: viaje.stopDestino,
                        trip: viaje.trip,
                        route: viaje.route,
                        startTime: viaje.departureTime,
                        endTime: viaje.arrivalTimeDestino,
                        wait: viaje.departureTime - currentTime
                    }];

                    pq.push({
                        stopId: viaje.stopDestino,
                        currentTime: viaje.arrivalTimeDestino,
                        path: newPath,
                        cost: cost + (viaje.fare || 0),
                        transfers: transfers + 1
                    }, viaje.arrivalTimeDestino); // Prioridad: Tiempo de llegada
                }
            }
        }

        return null; // No se encontró ruta
    }

    /**
     * Obtiene paradas dentro del radio de caminata.
     * Optimización: En un sistema real usaríamos un QuadTree o Grid, 
     * aquí iteramos (la DB no es gigante) o usamos las precalculadas.
     */
    obtenerParadasCercanas(currentStopId) {
        const vecinos = [];
        const currentStop = this.db.stops.get(currentStopId);
        if (!currentStop) return [];

        // Iterar sobre todas las paradas principales para ver cuales están cerca
        // NOTA: Para producción con miles de paradas, esto debe optimizarse.
        // Asumiendo < 500 paradas, esto es rápido en JS moderno.
        this.db.paradasPrincipales.forEach(targetStop => {
            if (targetStop.stop_id === currentStopId) return;

            const dist = this.getDistanciaHaversine(
                currentStop.stop_lat, currentStop.stop_lon,
                targetStop.stop_lat, targetStop.stop_lon
            );

            if (dist <= this.MAX_WALK_DISTANCE_KM) {
                vecinos.push({ id: targetStop.stop_id, distanceKm: dist });
            }
        });
        return vecinos;
    }

    /**
     * Busca en stop_times todos los viajes que salen de stopId después de time
     */
    obtenerViajesDesdeParada(stopId, minTime, fecha, diaSemana) {
        const opciones = [];
        
        // Obtenemos los hijos (andenes) de la parada actual para buscar salidas
        const andenes = this.db.paradasPadreHijas.get(stopId) || [stopId];
        
        // Recolectar todos los stop_times de salida desde esta ubicación
        let salidas = [];
        andenes.forEach(andenId => {
            const st = this.db.stopTimesPorParada.get(andenId);
            if (st) salidas = salidas.concat(st);
        });

        // Filtrar y procesar
        for (const stOrigen of salidas) {
            // 1. Chequeo rápido de validez de servicio (Fecha y Día)
            // Para optimizar, esto debería estar cacheado, pero lo hacemos directo
            if (!this.esServicioValido(stOrigen.trip_id, fecha, diaSemana)) continue;

            const trip = this.db.trips.get(stOrigen.trip_id);
            const route = this.db.routes.get(trip.route_id);
            const tarifaInfo = this.db.tarifas.get(route.route_id);
            const fare = tarifaInfo ? tarifaInfo.num : 0;
            const freqs = this.db.frequencies.get(stOrigen.trip_id);

            // Manejo de Frecuencias vs Horario Fijo
            let departureTimeSecs = -1;

            if (freqs && freqs.length > 0) {
                // Lógica de Frecuencia
                // Encontrar el primer viaje disponible basado en la frecuencia que salga >= minTime
                const stInicial = this.db.stopTimes.find(s => s.trip_id === stOrigen.trip_id && s.stop_sequence === 1);
                const offset = this.aSegundos(stOrigen.departure_time) - this.aSegundos(stInicial.departure_time);
                
                for (const freq of freqs) {
                    const startService = this.aSegundos(freq.start_time);
                    const endService = this.aSegundos(freq.end_time);
                    const headway = freq.headway_secs;

                    // Buscamos el siguiente slot: t + offset >= minTime
                    let t = startService;
                    // Avanzar t hasta que la salida sea válida
                    while ((t + offset) < minTime && t < endService) {
                        t += headway;
                    }

                    if ((t + offset) >= minTime && t < endService) {
                        departureTimeSecs = t + offset;
                        break; // Encontramos la salida más pronta en esta frecuencia
                    }
                }
            } else {
                // Horario Fijo
                const dep = this.aSegundos(stOrigen.departure_time);
                if (dep >= minTime) {
                    departureTimeSecs = dep;
                }
            }

            if (departureTimeSecs !== -1) {
                // Si encontramos una salida válida, buscamos a dónde nos lleva este viaje
                // Buscamos todas las paradas POSTERIORES en este viaje
                const paradasPosteriores = this.db.stopTimes.filter(st => 
                    st.trip_id === stOrigen.trip_id && 
                    st.stop_sequence > stOrigen.stop_sequence
                );

                for (const stDestino of paradasPosteriores) {
                    // Calcular tiempo llegada
                    let arrivalTimeSecs = 0;
                    
                    if (freqs && freqs.length > 0) {
                         // Recalcular basado en el departureTimeSecs que hallamos arriba
                         // Diferencia entre stDestino y stOrigen
                         const diff = this.aSegundos(stDestino.arrival_time) - this.aSegundos(stOrigen.departure_time);
                         arrivalTimeSecs = departureTimeSecs + diff;
                    } else {
                        arrivalTimeSecs = this.aSegundos(stDestino.arrival_time);
                    }

                    // Identificar la parada principal del destino (para el grafo)
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
                        fare: fare
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

        // Verificar rango de fechas
        if (fechaNum < cal.start_date || fechaNum > cal.end_date) return false;
        // Verificar día de la semana
        if (cal[diaSemanaStr] !== 1) return false;

        return true;
    }

    construirResultado(finalNode) {
        const pasos = [];
        let totalFare = 0;
        let monedas = new Set();

        // Procesar path
        // path es un array de segmentos
        finalNode.path.forEach(segment => {
            if (segment.type === 'walk') {
                pasos.push({
                    tipo: 'caminata',
                    origen: this.db.stops.get(segment.from).stop_name,
                    destino: this.db.stops.get(segment.to).stop_name,
                    horaSalida: this.segundosAHora(segment.startTime),
                    horaLlegada: this.segundosAHora(segment.endTime),
                    duracion: this.segundosAFormato(segment.duration),
                    distancia: segment.distance.toFixed(2) + ' km',
                    instruccion: `Camina ${segment.distance.toFixed(2)} km`
                });
            } else {
                const tarifaInfo = this.db.tarifas.get(segment.route.route_id);
                const precio = tarifaInfo ? tarifaInfo.num : 0;
                const moneda = tarifaInfo ? tarifaInfo.moneda : 'Bs.';
                
                totalFare += precio;
                monedas.add(moneda);

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
                    instruccion: `Toma la ruta ${segment.route.route_short_name} hacia ${segment.trip.trip_headsign}`
                });
            }
        });

        return {
            pasos: pasos,
            horaLlegada: this.segundosAHora(finalNode.currentTime),
            horaSalida: this.segundosAHora(finalNode.path[0].startTime),
            duracionTotal: this.segundosAFormato(finalNode.currentTime - finalNode.path[0].startTime),
            costoTotal: totalFare > 0 ? `${totalFare.toFixed(2)} ${[...monedas].join('/')}` : "Gratis / Desconocido",
            transbordos: finalNode.transfers
        };
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
        // Manejo de horas > 24 (ej: 25:00)
        return [
            h.toString().padStart(2, '0'),
            m.toString().padStart(2, '0'),
            s.toString().padStart(2, '0')
        ].join(':');
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
        const R = 6371; // km
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}

// Exportar para usar en el navegador
window.TransportePlanificador = TransportePlanificador;