import json
import csv
import urllib.request
import zipfile
import os
import shutil
from datetime import datetime, timedelta

# ==============================================================================
#   1. CONFIGURACIÓN GLOBAL (EDITA TODO ESTO AQUI)
# ==============================================================================

# --- ENLACES Y ARCHIVOS ---
URL_GTFS_ACTUAL = "https://transporte.cromstudio.com.ve/data/horarios.zip"
INPUT_GEOJSON   = "6051875.geojson"     # Tu archivo de la nueva ruta
OUTPUT_ZIP      = "horarios.zip" # Nombre del archivo final
TEMP_DIR        = "temp_gtfs_work"           # Carpeta temporal de trabajo

# --- DATOS DE LA AGENCIA (agency.txt) ---
# Nota: Si el agency_id ya existe en el GTFS, solo se usará para vincular la ruta.
ID_AGENCIA       = "MetroBus_CCS" 
NOMBRE_AGENCIA   = "Metro Bus Caracas"
URL_AGENCIA      = "https://transporte.cromstudio.com.ve"
TIMEZONE_AGENCIA = "America/Caracas"
LANG_AGENCIA     = "es"                   # <--- NUEVO: Idioma siempre en español

# --- DATOS DE LA NUEVA RUTA (routes.txt) ---
ID_RUTA          = "MB_CCS_501"      # ¡IMPORTANTE! Debe ser UNICO, que no exista ya en el zip
NOMBRE_CORTO     = "MetroBus 501"
NOMBRE_LARGO     = "Ruta Propatria - Casalta"
TIPO_RUTA        = 3                      # 3 = Bus
COLOR_RUTA       = "FF0000"               # Hexadecimal (Rojo)

# --- DATOS DEL SERVICIO Y HORARIOS ---
ID_SHAPE         = "shape_MB_CCS_501"     # ID único para el trazado
ID_TRIP_BASE     = "MB_CCS_501_TRIP"   # ID único para el viaje
ID_SERVICIO      = "SERVICIO_DIARIO"               # Debe coincidir con calendar.txt del zip original (o crearse)

HORA_INICIO      = "06:30:00"
HORA_FIN         = "21:00:00"
FRECUENCIA_MIN   = 45                     # Pasa cada 45 min
TIEMPO_ENTRE_PARADAS = 4                  # Minutos entre paradas

HEADSIGN_IDA     = "Sentido Casalta"   # <--- NUEVO: Nombre del destino Ida (0)
HEADSIGN_VUELTA  = "Sentido Propatria"  # <--- NUEVO: Nombre del destino Vuelta (1)

# ==============================================================================
#   FIN DE CONFIGURACIÓN
# ==============================================================================

def asegurar_salto_linea(file_path):
    """Verifica si el archivo termina en salto de línea."""
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
    
    trips_config = [
        {"suffix": "_ida", "direction": 0},
        {"suffix": "_vuelta", "direction": 1}
    ]
    
    sec_headway = FRECUENCIA_MIN * 60

    for trip_cfg in trips_config:
        trip_full_id = f"{ID_TRIP_BASE}{trip_cfg['suffix']}"
        curr_time = datetime.strptime(HORA_INICIO, "%H:%M:%S")

        for idx, stop in enumerate(stops_data):
            time_str = curr_time.strftime("%H:%M:%S")
            stop_times.append([trip_full_id, time_str, time_str, stop[0], idx + 1])
            curr_time += timedelta(minutes=TIEMPO_ENTRE_PARADAS)

        frequencies.append([trip_full_id, HORA_INICIO, HORA_FIN, sec_headway])
    
    return stop_times, frequencies

def append_csv(filename, headers, new_rows):
    file_path = os.path.join(TEMP_DIR, filename)
    file_exists = os.path.exists(file_path)
    
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
    print(f"¡PROCESO TERMINADO! Revisa la carpeta {TEMP_DIR} si quieres ver los TXT.")

def main():
    if not descargar_y_extraer(): return

    stops, shapes = procesar_geojson()
    if not stops: return

    stop_times, frequencies = calcular_horarios(stops)

    trip_rows = [
        [ID_RUTA, ID_SERVICIO, f"{ID_TRIP_BASE}_ida", HEADSIGN_IDA, 0, f"{ID_SHAPE}_i"],
        [ID_RUTA, ID_SERVICIO, f"{ID_TRIP_BASE}_vuelta", HEADSIGN_VUELTA, 1, f"{ID_SHAPE}_v"]
    ]
    
    route_row = [[ID_RUTA, ID_AGENCIA, NOMBRE_CORTO, NOMBRE_LARGO, TIPO_RUTA, COLOR_RUTA]]
    
    # --- CAMBIO AQUI: Se agregó LANG_AGENCIA a la fila ---
    agency_row = [[ID_AGENCIA, NOMBRE_AGENCIA, URL_AGENCIA, TIMEZONE_AGENCIA, LANG_AGENCIA]]

    print("5. Escribiendo datos en los archivos GTFS...")
    
    append_csv('stops.txt', ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'parent_station'], stops)
    append_csv('shapes.txt', ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], shapes)
    append_csv('routes.txt', ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color'], route_row)
    append_csv('trips.txt', ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id'], trip_rows)    
    append_csv('stop_times.txt', ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'], stop_times)
    append_csv('frequencies.txt', ['trip_id', 'start_time', 'end_time', 'headway_secs'], frequencies)
    
    # --- CAMBIO AQUI: Se agregó agency_lang a la cabecera ---
    append_csv('agency.txt', ['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang'], agency_row)

    empaquetar_zip()

if __name__ == '__main__':
    main()