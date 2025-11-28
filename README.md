<div align="center">

  # 🚍 Open Transit Venezuela
  
  **La iniciativa de código abierto para digitalizar el transporte público de Venezuela.**
  
  Desarrollado por **Crom Studio** y la comunidad.

  [![License: GPL-3.0](https://img.shields.io/badge/License-GPL-3.0-yellow.svg)](LICENSE)
  [![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)](LICENSE-DATA)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
  [![Data Standard](https://img.shields.io/badge/Standard-GTFS-blue)](https://gtfs.org/)

</div>

---

## 💡 Sobre el Proyecto

En Venezuela, la información sobre rutas de transporte, horarios y paradas suele estar dispersa o ser inexistente en el mundo digital. **Open Transit Venezuela** nace con una misión clara: **Democratizar la movilidad.**

Este repositorio centraliza los datos de transporte público (Urbano, Interurbano, Teleférico, Metro y Trenes) en formato estándar **GTFS (General Transit Feed Specification)**, listo para ser consumido por Google Maps, Apple Maps, aplicaciones de terceros e investigadores.

Además, incluye una **App/Herramienta** de código abierto para visualizar, validar y gestionar estos datos.

## 📂 Estructura del Repositorio

El proyecto se divide en dos componentes principales:

| Directorio | Descripción | Licencia |
| :--- | :--- | :--- |
| 📁 `/data` | Contiene los archivos **GTFS** (rutas, horarios, paradas). | **CC BY 4.0** (Datos Abiertos) |
| 📁 `index.html` | El código fuente de la aplicación/web para visualizar y gestionar los datos. | **GPL-3.0** |


## 🤝 Cómo Contribuir (¡Necesitamos tu ayuda!)

Este es un proyecto impulsado por la comunidad. No necesitas ser programador para ayudar; necesitamos **Mappers** y **Conocedores de Rutas**.

### ¿Qué puedes hacer?

* 🚍 **Mapear Rutas:** Si conoces el recorrido exacto de una línea de autobús en tu ciudad, puedes ayudarnos a crear su archivo de ruta.
* 📍 **Validar Paradas:** Verifica si las coordenadas de las paradas existentes son correctas.
* 💻 **Código:** Mejora la aplicación de visualización o crea scripts de automatización.
* 📢 **Difusión:** Comparte el proyecto con transportistas y universidades.

### 1. Reportar Errores o Nuevos Datos (Fácil)

Si conoces una ruta, una parada nueva, o ves un error en los datos actuales, no necesitas tocar el código:

-   **Opción A (GitHub):** Abre un _Issue_ en este repositorio describiendo la ruta o el error.
    
-   **Opción B (Correo):** Escríbenos directamente a **soporte@cromstudio.com.ve**.

### 2. Colaboración Técnica (Git)

Si te manejas con Git y quieres aportar directamente:

1.  Haz un **Fork** de este repositorio.
    
2.  Crea una rama (`git checkout -b feature/NuevaRutaMaracaibo`).
    
3.  Haz tus cambios en los archivos `.txt` dentro de `/data`.
    
4.  Abre un **Pull Request** describiendo tus cambios.
    

> **Nota:** Estamos construyendo una comunidad inclusiva. Cualquier aporte, desde una corrección de ortografía hasta una ruta completa de Metro, es valiosa.

## 🗺️ Estado del Mapa (Roadmap)

* [X] **Fase 1:** Estructura del proyecto y repositorio inicial.
* [X] **Fase 2:** Carga inicial de rutas principales (Caracas, Maracaibo, Guanare).
* [ ] **Fase 3:** Validación oficial con Plataformas de Mapeo.
* [ ] **Fase 4:** Integración de datos en tiempo real (futuro).


### Archivos Personalizados (Extensiones)

Hemos añadido archivos extra para información local específica no cubierta por el estándar básico.

#### `tarifas.txt`

Define el costo numérico y la descripción del pago para cada ruta de manera explícita.

```
route_id,tarifa_num,tipo_moneda,descripcion_tarifa
CSS-GRE,25,USD,Tarifa Caracas-Guanare: 25 USD (Pago móvil o efectivo)

```

#### `noticias.txt`

Sistema de alertas y novedades para la App.

-   Si `route_id` está vacío: Noticia general.
    
-   Si tiene `trip_headsign`: Noticia específica para un sentido del viaje.
    

```
noticia_id,fecha_publicacion,tipo,titulo,descripcion,route_id,trip_headsign
2,2025-11-13 17:00,ALERTA,Retrasos,Obras en la vía,L-CUATRI,Sentido Escuque

```


## 📄 Licencias

Este proyecto utiliza un esquema de **licencia dual** para fomentar la colaboración y el uso libre:

* 💻 **Código Fuente:** Bajo la licencia **[GPL-3.0](LICENSE)**.
* 🗺️ **Datos (GTFS):** Bajo la licencia **[Creative Commons Atribución 4.0 Internacional (CC BY 4.0)](LICENSE-DATA)**.

<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Licencia Creative Commons" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />Esta obra está bajo una <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Licencia Creative Commons Atribución 4.0 Internacional</a>.

### Atribución
Al usar estos datos, por favor citar como:
> *"Datos provistos por Crom Studio y la comunidad de Open Transit Venezuela."*

---

<div align="center">
  Hecho con ❤️ en Venezuela por <b>Crom Studio</b> y colaboradores.
</div>
