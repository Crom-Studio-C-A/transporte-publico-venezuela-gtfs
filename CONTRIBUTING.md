
# Guía de Contribución para Open Transit Venezuela 🚍🇻🇪

¡Gracias por tu interés en contribuir a Open Transit Venezuela! 🎉

Este proyecto existe gracias a personas como tú que dedican su tiempo a mejorar la movilidad de nuestro país. Ya sea que estés corrigiendo una coordenada, agregando una nueva ruta de autobús o simplemente reportando un error, tu ayuda es invaluable para miles de usuarios.

Lo mejor de todo es que **no necesitas ser programador** para ayudar. La parte más importante de este proyecto son los **datos** (las rutas y horarios), y eso es algo en lo que todos pueden colaborar.

## 📋 Tabla de Contenidos

1.  [Código de Conducta](https://www.google.com/search?q=%23-c%C3%B3digo-de-conducta "null")
    
2.  [¿Cómo puedo ayudar?](https://www.google.com/search?q=%23-c%C3%B3mo-puedo-ayudar "null")
    
    -   [Reportar Errores de Datos](https://www.google.com/search?q=%23reportar-errores-de-datos "null")
        
    -   [Mappers: Agregar o Editar Rutas (GTFS)](https://www.google.com/search?q=%23mappers-agregar-o-editar-rutas-gtfs "null")
    - [Convertir de Open Street Maps a GTFS (Opción Fácil)](https://www.google.com/search?q=%23mappers-agregar-o-editar-rutas-gtfs "null")
        
3.  [Guía de Estilo para Datos (GTFS)](https://www.google.com/search?q=%23-gu%C3%ADa-de-estilo-para-datos-gtfs "null")
    
4.  [Proceso de Pull Request](https://www.google.com/search?q=%23-proceso-de-pull-request "null")
    
5.  [Licencias](https://www.google.com/search?q=%23-licencias "null")
    

## 🤝 Código de Conducta

Este proyecto se adhiere a un código de conducta simple: **Seamos amables y constructivos.**

Estamos construyendo esto juntos. Las críticas deben ser hacia el código o los datos, nunca hacia las personas. Aceptamos colaboradores de todos los niveles de experiencia y orígenes.

## 🚀 ¿Cómo puedo ayudar?

### Reportar Errores de Datos

Si ves que una parada está mal ubicada en el mapa, un horario es incorrecto, o una ruta ya no existe:

1.  Ve a la pestaña de **Issues** en este repositorio de GitHub.
    
2.  Crea un **"New Issue"**.
    
3.  Usa un título descriptivo: `Error en Parada [Nombre] - [Ciudad]`.
    
4.  Describe el error con detalle.
    
    -   _Ejemplo:_ "La parada 'Plaza Bolívar' está marcada a mitad de cuadra, pero en realidad está en la esquina, frente al banco".
        
5.  **Alternativa:** Si no usas GitHub, envíanos un correo con los detalles a **soporte@cromstudio.com.ve**. ¡Nosotros nos encargamos del resto!
    

### Mappers: Agregar o Editar Rutas (GTFS)

Si te animas a meter las manos en la masa, la "carne" del proyecto está en los archivos de datos. Usamos un estándar llamado **GTFS**, que son simples archivos de texto (`.txt`) que funcionan como tablas de Excel.

**¿Dónde están los datos?** Todos los archivos están en la carpeta principal (o `/data` si existe). Los archivos clave son:

-   `agency.txt`: Las empresas de transporte.
    
-   `stops.txt`: Las paradas y sus coordenadas.
    
-   `routes.txt`: Los nombres de las rutas.
    
-   `trips.txt` y `stop_times.txt`: Los itinerarios y horarios.
    

**Herramientas Recomendadas:**

-   Cualquier editor de texto plano (**VS Code**, **Notepad++**, Sublime Text).
    
-   ⚠️ **Advertencia:** Si usas Excel o Google Sheets, ten mucho cuidado con el formato de las celdas (especialmente las fechas y horas), ya que pueden corromper el archivo al guardar. Siempre verifica el formato antes de subirlo.

### Convertir de Open Street Maps a GTFS (Opción Fácil)
Existe la posibilidad de convertir la información desde Open Street Maps (OSM) al GTFS de Open Transit Venezuela (OTV), para ello le recomendamos ir al siguiente [documento](https://github.com/Crom-Studio-C-A/transporte-publico-venezuela-gtfs/tree/main-web/convertidor), donde puede ver más información. 

Creamos un pequeño archivo de Python, el cual permite convertir datos de GEOJSON a GTFS, pero se debe de usar con mucho cuidado, algunos datos se pueden duplicar. 
    

## 📏 Guía de Estilo para Datos (GTFS)

Para que la aplicación funcione bien y se vea profesional, por favor sigue estas reglas al editar los archivos:

### 1. Nombres de Paradas (`stops.txt`)

-   **No uses abreviaturas confusas.**
    
    -   ❌ Mal: `Term. de Pasajeros`, `Av. Bolivar`
        
    -   ✅ Bien: `Terminal de Pasajeros`, `Avenida Bolívar`
        
-   **Capitalización:** Usa "Title Case" (Primera Letra Mayúscula).
    
    -   ❌ Mal: `plaza bolivar`, `PLAZA BOLIVAR`
        
    -   ✅ Bien: `Plaza Bolívar`
        

### 2. Coordenadas (`stops.txt`)

-   Usa **Grados Decimales** (Latitud, Longitud).
    
-   Asegúrate de usar al menos **5 o 6 decimales** de precisión (ej. `10.480567`). Esto garantiza que el punto en el mapa sea exacto (precisión de metros).
    
    -   _Ejemplo:_ `10.480567, -66.903644`
        

### 3. Rutas (`routes.txt`)

-   **`route_short_name`:** Debe ser el número o nombre corto que la gente ve escrito en el vidrio del bus.
    
    -   _Ejemplo:_ `019`, `L1`, `Expreso`.
        
-   **`route_long_name`:** Debe ser descriptivo indicando Origen y Destino.
    
    -   _Ejemplo:_ `La Bandera - Los Teques`, `Guanare - Biscucuy`.
        

### 4. Tarifas (`tarifas.txt` - Personalizado)

-   Este es un archivo especial nuestro.
    
-   Siempre especifica la **moneda** (`USD`, `VES`).
    
-   En la descripción, sé claro sobre el método de pago (efectivo, pago móvil, tarjeta).
    

## 🔀 Proceso de Pull Request

Si ya editaste los archivos y quieres enviar tus cambios:

1.  Haz un **Fork** de este repositorio.
    
2.  Crea una nueva rama (**Branch**) para tu contribución:
    
    -   `git checkout -b datos/ruta-valencia-centro`
        
    -   `git checkout -b fix/coordenada-plaza`
        
3.  Realiza tus cambios en los archivos `.txt`.
    
4.  Haz un **Commit** con un mensaje claro:
    
    -   `feat: agrega ruta 25 de Valencia`
        
    -   `fix: corrige coordenadas Plaza Venezuela`
        
5.  Haz **Push** a tu fork.
    
6.  Abre un **Pull Request (PR)** hacia la rama `main` de este repositorio.
    
7.  En la descripción del PR, explica brevemente qué cambios hiciste y por qué (ej. "Añadí la nueva ruta que inauguraron ayer").
    

**¿Necesitas ayuda?** Si te atascas en algún paso técnico, no te preocupes. Envíanos los datos crudos (nombres, coordenadas, horarios) a **soporte@cromstudio.com.ve** y nuestro equipo técnico te ayudará a integrarlos.

## ⚖️ Licencias

Al contribuir a este proyecto, aceptas que:

-   Tus aportes de código (si los hubiera) serán licenciados bajo la **Licencia MIT**.
    
-   Tus aportes de datos serán licenciados bajo **Creative Commons Atribución 4.0 (CC BY 4.0)**.
    

Esto asegura que el proyecto siga siendo libre, abierto y beneficioso para todos los venezolanos.

**¡Gracias por ayudar a mover a Venezuela! 🚍🇻🇪**
