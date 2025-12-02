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
OUTPUT_ZIP      = "horarios_actualizado.zip" # Nombre del archivo final
TEMP_DIR        = "temp_gtfs_work"           # Carpeta temporal de trabajo

# --- DATOS DE LA AGENCIA (agency.txt) ---
# Nota: Si el agency_id ya existe en el GTFS, solo se usará para vincular la ruta.
ID_AGENCIA       = "CromStudio" 
NOMBRE_AGENCIA   = "Crom Studio Transport"
URL_AGENCIA      = "https://transporte.cromstudio.com.ve"
TIMEZONE_AGENCIA = "America/Caracas"

# --- DATOS DE LA NUEVA RUTA (routes.txt) ---
ID_RUTA          = "ruta_caracas_02"      # ¡IMPORTANTE! Debe ser UNICO, que no exista ya en el zip
NOMBRE_CORTO     = "L2"
NOMBRE_LARGO     = "Ruta La Candelaria - Centro"
TIPO_RUTA        = 3                      # 3 = Bus
COLOR_RUTA       = "FF0000"               # Hexadecimal (Rojo)

# --- DATOS DEL SERVICIO Y HORARIOS ---
ID_SHAPE         = "shape_caracas_02"     # ID único para el trazado
ID_TRIP          = "viaje_plantilla_02"   # ID único para el viaje
ID_SERVICIO      = "diario"               # Debe coincidir con calendar.txt del zip original (o crearse)

HORA_INICIO      = "06:30:00"
HORA_FIN         = "21:00:00"
FRECUENCIA_MIN   = 30                     # Pasa cada 30 min
TIEMPO_ENTRE_PARADAS = 4                  # Minutos entre paradas

# ==============================================================================
#   FIN DE CONFIGURACIÓN
# ==============================================================================

def descargar_y_extraer():
    print(f"1. Descargando GTFS actual desde: {URL_GTFS_ACTUAL} ...")
    zip_path = "temp_download.zip"
    
    # Descarga el archivo
    try:
        urllib.request.urlretrieve(URL_GTFS_ACTUAL, zip_path)
    except Exception as e:
        print(f"Error descargando: {e}")
        return False

    # Crea carpeta temporal limpia
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR)

    # Descomprime
    print("2. Descomprimiendo archivos...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(TEMP_DIR)
    
    # Borra el zip descargado para limpiar
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
            # Parada
            stop_id = props.get('@id', f"stop_{ID_RUTA}_{len(stops_data)}")
            name = props.get('name', props.get('ref', 'Parada Nueva'))
            stops_data.append([stop_id, name, coords[1], coords[0], '', '']) # Lat, Lon
            
        elif geom.get('type') == 'LineString':
            # Shape
            for pt in coords:
                shapes_data.append([ID_SHAPE, pt[1], pt[0], shape_seq]) # Lat, Lon
                shape_seq += 1
                
    return stops_data, shapes_data

def calcular_horarios(stops_data):
    print("4. Calculando horarios y frecuencias...")
    stop_times = []
    curr_time = datetime.strptime(HORA_INICIO, "%H:%M:%S")
    
    for idx, stop in enumerate(stops_data):
        time_str = curr_time.strftime("%H:%M:%S")
        # trip_id, arrival, departure, stop_id, sequence
        stop_times.append([ID_TRIP, time_str, time_str, stop[0], idx + 1])
        curr_time += timedelta(minutes=TIEMPO_ENTRE_PARADAS)
        
    # Frequencies
    sec_headway = FRECUENCIA_MIN * 60
    # trip_id, start_time, end_time, headway_secs
    frequencies = [[ID_TRIP, HORA_INICIO, HORA_FIN, sec_headway]]
    
    return stop_times, frequencies

def append_csv(filename, headers, new_rows):
    """
    Esta funcion es clave: Si el archivo existe, AGREGA al final.
    Si no existe, lo crea con cabeceras.
    """
    file_path = os.path.join(TEMP_DIR, filename)
    file_exists = os.path.exists(file_path)
    
    mode = 'a' if file_exists else 'w'
    
    with open(file_path, mode, newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        
        # Si el archivo es nuevo, escribimos cabeceras
        if not file_exists:
            writer.writerow(headers)
            print(f"   -> Creando nuevo archivo: {filename}")
        else:
            print(f"   -> Actualizando archivo existente: {filename}")
            
        # Escribimos las filas nuevas
        writer.writerows(new_rows)

def empaquetar_zip():
    print(f"6. Generando nuevo ZIP: {OUTPUT_ZIP}...")
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(TEMP_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                # Guardamos el archivo en la raiz del zip
                zipf.write(file_path, arcname=file)
    
    # Limpieza final
    shutil.rmtree(TEMP_DIR)
    print("¡PROCESO TERMINADO CON ÉXITO!")

def main():
    # 1. Bajar GTFS
    if not descargar_y_extraer():
        return

    # 2. Parsear GeoJSON
    stops, shapes = procesar_geojson()
    if not stops: return

    # 3. Calcular Tiempos
    stop_times, frequencies = calcular_horarios(stops)

    # 4. Preparar datos de una sola linea (Ruta, Trip, Agencia)
    
    # routes.txt: route_id, agency_id, route_short_name, route_long_name, route_type, route_color
    route_row = [[ID_RUTA, ID_AGENCIA, NOMBRE_CORTO, NOMBRE_LARGO, TIPO_RUTA, COLOR_RUTA]]
    
    # trips.txt: route_id, service_id, trip_id, shape_id
    trip_row = [[ID_RUTA, ID_SERVICIO, ID_TRIP, ID_SHAPE]]
    
    # agency.txt: agency_id, agency_name, agency_url, agency_timezone
    # Nota: Aquí podriamos chequear si ya existe, pero añadirlo no suele romper nada 
    # si los validadores son permisivos, o si es la primera vez.
    agency_row = [[ID_AGENCIA, NOMBRE_AGENCIA, URL_AGENCIA, TIMEZONE_AGENCIA]]

    # 5. AÑADIR A LOS ARCHIVOS (APPEND)
    print("5. Escribiendo datos en los archivos GTFS...")
    
    append_csv('stops.txt', ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'parent_station'], stops)
    append_csv('shapes.txt', ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], shapes)
    append_csv('routes.txt', ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color'], route_row)
    append_csv('trips.txt', ['route_id', 'service_id', 'trip_id', 'shape_id'], trip_row)
    append_csv('stop_times.txt', ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'], stop_times)
    append_csv('frequencies.txt', ['trip_id', 'start_time', 'end_time', 'headway_secs'], frequencies)
    
    # Opcional: Solo añadir agencia si estamos seguros, o crearla si no existe
    append_csv('agency.txt', ['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], agency_row)

    # 6. Finalizar
    empaquetar_zip()

if __name__ == '__main__':
    main()