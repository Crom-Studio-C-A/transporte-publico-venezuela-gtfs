
# 📘 Documentación: Crom Studio GTFS Updater

## Descripción

Esta herramienta automatizada permite agregar nuevas rutas de transporte público al sistema GTFS de **Open Transit Venezuela**. El script descarga el GTFS actual, procesa la geometría de una nueva ruta desde OpenStreetMap (OSM) y actualiza los archivos existentes sin borrar la información previa.

**Características principales:**

-   Descarga automática del `horarios.zip` actual.
    
-   Generación de horarios estimados basados en frecuencias.
    
-   Soporte para **Ida y Vuelta** (Direction 0 y 1).
    
-   Configuración de letreros (Headsigns) y colores.
    
-   Validación de estructura de archivos (evita errores de saltos de línea).
    

----------

## 🛠️ Paso 1: Obtener la Geometría (GeoJSON)

Necesitamos extraer el trazado de la ruta desde OpenStreetMap.

1.  Ve a la página web: **[Overpass Turbo](https://overpass-turbo.eu/)**.
    
2.  Busca en [OpenStreetMap.org](https://www.openstreetmap.org/) el **ID de la Relación** de la ruta que quieres importar (aparece a la izquierda al seleccionar la ruta, ej: `Relación: 123456`).
    
3.  En Overpass Turbo, borra el código existente y pega este script (sustituye el número):
    

XML

```
[out:json];
// Sustituye el numero abajo por el ID de tu ruta
relation(TU_ID_DE_RELACION);
(
  ._;
  >;
);
out body;

```

4.  Presiona el botón **Ejecutar** (Run).
    
5.  Presiona **Exportar** y selecciona **"Datos -> GeoJSON"**.
    
6.  Guarda el archivo descargado en la carpeta del proyecto con el nombre: `ruta_caracas.geojson`.
    

----------

## ⚙️ Paso 2: Configuración de la Ruta

Abre el script update_gtfs.py con tu editor de código (VS Code, Bloc de notas, etc.).

Al inicio del archivo encontrarás la sección CONFIGURACIÓN MAESTRA. Debes editar SOLO esta parte para cada nueva ruta.

![enter image description here](https://i.imgur.com/AhCBgOv.png)

----------

## ▶️ Paso 3: Ejecución

1.  Abre tu terminal o consola de comandos.
    
2.  Navega hasta la carpeta del proyecto.
    
3.  Ejecuta el comando:
    

Bash

```
python convertidor.py

```

----------

## 📂 Paso 4: Resultados

El script realizará las siguientes acciones:

1.  Creará una carpeta temporal `temp_gtfs_work` con los archivos `.txt` descomprimidos.
    
2.  Agregará las nuevas líneas al final de `routes.txt`, `trips.txt`, `stops.txt`, etc.
    
3.  Generará un nuevo archivo comprimido llamado:
    
    > **`horarios.zip`**
    

Este es el archivo final GTFS actualizado.

## Recomendamos que verifique manualmente cada uno de los archivos, ya que algunas veces se pueden duplicar paradas.



### PARTE 2: El Código Python Definitivo (v4.0)

Copia este código y guárdalo como `convertidor.py`. Ya incluye:

-   `agency_lang`
    
-   `trip_headsign` antes de `direction_id`
    
-   Lógica de Ida/Vuelta.
    
-   Corrección de saltos de línea.
    

Python

```
import json
import csv
import urllib.request
import zipfile
import os
import shutil
from datetime import datetime, timedelta

# ==============================================================================
#   1. CONFIGURACIÓN MAESTRA (EDITAR ESTO PARA CADA NUEVA RUTA)
# ==============================================================================

# --- ENLACES Y ARCHIVOS ---
URL_GTFS_ACTUAL = "https://transporte.cromstudio.com.ve/data/horarios.zip"
INPUT_GEOJSON   = "ruta_caracas.geojson"     # El archivo que bajaste de Overpass
OUTPUT_ZIP      = "horarios_actualizado.zip" # El archivo final que se genera
TEMP_DIR        = "temp_gtfs_work"           # Carpeta de trabajo temporal

# --- DATOS DE LA AGENCIA ---
ID_AGENCIA       = "CromStudio" 
NOMBRE_AGENCIA   = "Crom Studio Transport"
URL_AGENCIA      = "https://transporte.cromstudio.com.ve"
TIMEZONE_AGENCIA = "America/Caracas"
LANG_AGENCIA     = "es"                   # Idioma (Español)

# --- DATOS DE LA NUEVA RUTA ---
ID_RUTA          = "ruta_caracas_03"      # ¡OJO! CAMBIAR SIEMPRE. Debe ser único.
NOMBRE_CORTO     = "L3"
NOMBRE_LARGO     = "Ruta Propatria - Chacaíto"
TIPO_RUTA        = 3                      # 3 = Bus
COLOR_RUTA       = "008000"               # Verde Hexadecimal

# --- DATOS DEL SERVICIO Y HORARIOS ---
ID_SHAPE         = "shape_caracas_03"     # ID único para el dibujo del mapa
ID_TRIP_BASE     = "viaje_L3"             # ID base para el viaje
ID_SERVICIO      = "diario"               # Debe coincidir con calendar.txt existente

HEADSIGN_IDA     = "Sentido Chacaíto"     # Letrero de Ida (Direction 0)
HEADSIGN_VUELTA  = "Sentido Propatria"    # Letrero de Vuelta (Direction 1)

HORA_INICIO      = "06:00:00"
HORA_FIN         = "22:00:00"
FRECUENCIA_MIN   = 45                     # Pasa cada 45 min
TIEMPO_ENTRE_PARADAS = 4                  # Minutos estimados entre paradas

# ==============================================================================
#   FIN DE CONFIGURACIÓN - NO TOCAR NADA ABAJO
# ==============================================================================

def asegurar_salto_linea(file_path):
    """Verifica si el archivo termina en salto de línea para evitar pegar datos."""
    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
        with open(file_path, 'rb+') as f:
            f.seek(-1, 2)
            ultimo_char = f.read(1)
            if ultimo_char != b'\n' and ultimo_char != b'\r':
                print(f"   [!] Corrigiendo falta de salto de línea en {os.path.basename(file_path)}")
                f.write(b'\n')

def descargar_y_extraer():
    print(f"1. Descargando GTFS actual desde: {URL_GTFS_ACTUAL} ...")
    zip_path = "temp_download.zip"
    
    try:
        urllib.request.urlretrieve(URL_GTFS_ACTUAL, zip_path)
    except Exception as e:
        print(f"Error descargando: {e}")
        return False

    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR)

    print("2. Descomprimiendo archivos...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(TEMP_DIR)
    
    os.remove(zip_path)
    return True

def procesar_geojson():
    print(f"3. Procesando geometría desde {INPUT_GEOJSON}...")
    try:
        with open(INPUT_GEOJSON, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("¡Error! No encuentro el archivo GeoJSON.")
        return None, None

    stops_data = []
    shapes_data = []
    shape_seq = 0

    for feature in data['features']:
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})
        coords = geom.get('coordinates')
        
        if geom.get('type') == 'Point':
            # GTFS pide Lat, Lon. GeoJSON da Lon, Lat.
            stop_id = props.get('@id', f"stop_{ID_RUTA}_{len(stops_data)}")
            name = props.get('name', props.get('ref', 'Parada Nueva'))
            stops_data.append([stop_id, name, coords[1], coords[0], '', '']) 
            
        elif geom.get('type') == 'LineString':
            for pt in coords:
                shapes_data.append([ID_SHAPE, pt[1], pt[0], shape_seq])
                shape_seq += 1
                
    return stops_data, shapes_data

def calcular_horarios(stops_data):
    print("4. Calculando horarios y frecuencias (Ida y Vuelta)...")
    
    stop_times = []
    frequencies = []
    
    # Configuración de los dos sentidos
    trips_config = [
        {"suffix": "_ida", "direction": 0},
        {"suffix": "_vuelta", "direction": 1}
    ]
    
    sec_headway = FRECUENCIA_MIN * 60

    for trip_cfg in trips_config:
        trip_full_id = f"{ID_TRIP_BASE}{trip_cfg['suffix']}"
        curr_time = datetime.strptime(HORA_INICIO, "%H:%M:%S")

        # Generar tiempos de parada
        for idx, stop in enumerate(stops_data):
            time_str = curr_time.strftime("%H:%M:%S")
            # trip_id, arrival, departure, stop_id, sequence
            stop_times.append([trip_full_id, time_str, time_str, stop[0], idx + 1])
            curr_time += timedelta(minutes=TIEMPO_ENTRE_PARADAS)

        # Generar frecuencia
        # trip_id, start_time, end_time, headway_secs
        frequencies.append([trip_full_id, HORA_INICIO, HORA_FIN, sec_headway])
    
    return stop_times, frequencies

def append_csv(filename, headers, new_rows):
    file_path = os.path.join(TEMP_DIR, filename)
    file_exists = os.path.exists(file_path)
    
    # Verificar salto de línea si el archivo ya existe
    if file_exists:
        asegurar_salto_linea(file_path)
    
    mode = 'a' if file_exists else 'w'
    
    with open(file_path, mode, newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        
        if not file_exists:
            writer.writerow(headers)
            print(f"   -> Creando nuevo archivo: {filename}")
        else:
            print(f"   -> Actualizando archivo existente: {filename}")
            
        writer.writerows(new_rows)

def empaquetar_zip():
    print(f"6. Generando nuevo ZIP: {OUTPUT_ZIP}...")
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(TEMP_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                zipf.write(file_path, arcname=file)
    print(f"¡ÉXITO! Tu archivo {OUTPUT_ZIP} está listo.")
    print(f"Nota: Los archivos temporales siguen en la carpeta '{TEMP_DIR}' por si quieres revisarlos.")

def main():
    # 1. Descargar
    if not descargar_y_extraer(): return

    # 2. Procesar GeoJSON
    stops, shapes = procesar_geojson()
    if not stops: return

    # 3. Calcular Horarios
    stop_times, frequencies = calcular_horarios(stops)

    # 4. Preparar Filas
    
    # trips.txt: route_id, service_id, trip_id, trip_headsign, direction_id, shape_id
    trip_rows = [
        [ID_RUTA, ID_SERVICIO, f"{ID_TRIP_BASE}_ida", HEADSIGN_IDA, 0, ID_SHAPE],
        [ID_RUTA, ID_SERVICIO, f"{ID_TRIP_BASE}_vuelta", HEADSIGN_VUELTA, 1, ID_SHAPE]
    ]
    
    # routes.txt: route_id, agency_id, short_name, long_name, type, color
    route_row = [[ID_RUTA, ID_AGENCIA, NOMBRE_CORTO, NOMBRE_LARGO, TIPO_RUTA, COLOR_RUTA]]
    
    # agency.txt: id, name, url, timezone, lang
    agency_row = [[ID_AGENCIA, NOMBRE_AGENCIA, URL_AGENCIA, TIMEZONE_AGENCIA, LANG_AGENCIA]]

    print("5. Escribiendo datos en los archivos GTFS...")
    
    # 5. Escribir (Append)
    append_csv('stops.txt', ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'parent_station'], stops)
    append_csv('shapes.txt', ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], shapes)
    append_csv('routes.txt', ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color'], route_row)
    append_csv('trips.txt', ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id'], trip_rows)
    append_csv('stop_times.txt', ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'], stop_times)
    append_csv('frequencies.txt', ['trip_id', 'start_time', 'end_time', 'headway_secs'], frequencies)
    append_csv('agency.txt', ['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang'], agency_row)

    # 6. Comprimir
    empaquetar_zip()

if __name__ == '__main__':
    main()
```