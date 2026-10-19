
"use strict";

// Busca un elemento de la página usando su ID.
const $ = (id) => document.getElementById(id);

// Coordenadas iniciales del mapa en Manizales.
const CENTRO_INICIAL = [5.0689, -75.5174];

// Precisión máxima aceptada para revisar la ubicación.
const PRECISION_MAX = 300;

// Nombre que usamos para guardar los datos en el navegador.
const CLAVE_GUARDADO = "tallerPoligonoGeoJSON";

// Elementos de las pestañas.
const pestanas = document.querySelectorAll(".pestana");
const paneles = document.querySelectorAll(".panel-pestana");

// Creamos el mapa y lo centramos en Manizales.
const mapa = L.map("mapa").setView(CENTRO_INICIAL, 15);

// Agregamos el mapa de OpenStreetMap.
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(mapa);

// Variables para guardar los puntos y los elementos del mapa.
let puntos = [];
let vertices = [];
let poligono = null;

// Línea que une los puntos mientras dibujamos.
let lineaGuia = L.polyline([], {
    color: "#e67e22",
    dashArray: "6 6"
}).addTo(mapa);

// Elementos que muestran la ubicación del usuario.
let marcadorUsuario = null;
let circuloPrecision = null;
let ultimaUbicacion = null;

// Permite iniciar y detener el seguimiento de la ubicación.
let watchId = null;

// Guarda si el usuario estaba dentro o fuera del polígono.
let posicionAnteriorGeocerca = null;


// Muestra un mensaje en la página.
function mostrarInfo(texto) {
    $("info").textContent = texto;
}

// Activa o desactiva los botones según el estado del mapa.
function actualizarBotones() {
    $("btnCerrar").disabled = puntos.length < 3 || poligono !== null;
    $("btnDeshacer").disabled = puntos.length === 0;
    $("btnExportar").disabled = puntos.length < 3;
    $("btnVigilar").disabled = poligono === null || watchId !== null;
    $("btnPararVigilancia").disabled = watchId === null;
}

// Obtiene el nombre escrito o usa uno por defecto.
function nombreActual() {
    return $("nombrePoligono").value.trim() || "Mi polígono";
}

// Obtiene el color seleccionado.
function colorActual() {
    return $("colorPoligono").value;
}


// Muestra las coordenadas de los puntos en la tabla.
function actualizarTabla() {
    const tabla = $("tablaPuntos");
    tabla.replaceChildren();

    if (puntos.length === 0) {
        const fila = tabla.insertRow();
        const celda = fila.insertCell();
        celda.colSpan = 3;
        celda.textContent = "Aún no hay puntos.";
        return;
    }

    // Recorremos los puntos y mostramos sus coordenadas.
    puntos.forEach(([lat, lng], indice) => {
        const fila = tabla.insertRow();
        fila.insertCell().textContent = indice + 1;
        fila.insertCell().textContent = lat.toFixed(6);
        fila.insertCell().textContent = lng.toFixed(6);
    });
}


// Dibuja el polígono cuando hay al menos tres puntos.
function redibujarPoligono() {
    if (puntos.length >= 3) {
        if (poligono) {
            // Actualizamos la figura si ya existe.
            poligono.setLatLngs(puntos);
        } else {
            // Creamos la figura con el color seleccionado.
            poligono = L.polygon(puntos, {
                color: colorActual(),
                fillColor: colorActual(),
                fillOpacity: 0.3
            }).addTo(mapa);
        }
    } else if (poligono) {
        // Quitamos el polígono si quedan menos de tres puntos.
        mapa.removeLayer(poligono);
        poligono = null;
    }

    actualizarMedidas();
    actualizarBotones();
}


// Calcula el área y el perímetro y revisa si hay cruces.
function actualizarMedidas() {
    if (puntos.length < 3) {
        $("area").textContent = "—";
        $("perimetro").textContent = "—";
        $("validacion").textContent =
            "Se necesitan al menos 3 puntos para calcular las medidas.";
        return;
    }

    try {
        const geo = aGeoJSON();

        // Calculamos el área en metros cuadrados.
        const area = turf.area(geo);

        // Calculamos la longitud del borde del polígono.
        const perimetro = turf.length(
            turf.polygonToLine(geo),
            { units: "meters" }
        );

        // Revisamos si los bordes se cruzan.
        const tieneCruces = turf.kinks(geo).features.length > 0;

        $("area").textContent =
            `${area.toFixed(1)} m² (${(area / 10000).toFixed(3)} ha)`;

        $("perimetro").textContent = `${perimetro.toFixed(1)} m`;

        $("validacion").textContent = tieneCruces
            ? "Advertencia: el polígono se cruza consigo mismo; el área puede no ser correcta."
            : "Medición calculada correctamente.";
    } catch (e) {
        $("validacion").textContent = "Error al calcular medidas.";
    }
}


// Convierte los puntos al formato GeoJSON.
function aGeoJSON() {
    if (puntos.length < 3) {
        throw new Error("Se necesitan al menos 3 puntos.");
    }

    // GeoJSON guarda primero la longitud y después la latitud.
    const anillo = puntos.map(([lat, lng]) => [lng, lat]);

    // Unimos el último punto con el primero para cerrar la figura.
    anillo.push([...anillo[0]]);

    return turf.polygon([anillo], {
        nombre: nombreActual(),
        creado: new Date().toISOString()
    });
}


// Coloca marcadores en los puntos para poder moverlos.
function dibujarMarcadores() {
    // Quitamos los marcadores anteriores.
    vertices.forEach((v) => mapa.removeLayer(v));
    vertices = [];

    puntos.forEach(([lat, lng], index) => {
        const marcador = L.marker([lat, lng], {
            draggable: true,
            icon: L.divIcon({
                className: "custom-vertex-icon",
                html: `<div style="background-color: #f39c12; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #e67e22; cursor: move;"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            })
        }).addTo(mapa);

        // Actualizamos el punto cuando movemos su marcador.
        marcador.on("drag", (e) => {
            const nuevaPos = e.target.getLatLng();
            puntos[index] = [nuevaPos.lat, nuevaPos.lng];

            lineaGuia.setLatLngs(poligono ? [] : puntos);
            redibujarPoligono();
            actualizarTabla();
        });

        vertices.push(marcador);
    });

    // Mostramos la línea mientras dibujamos.
    lineaGuia.setLatLngs(poligono ? [] : puntos);
}


// Cambia el color del polígono.
function aplicarEstiloPoligono() {
    if (poligono) {
        poligono.setStyle({
            color: colorActual(),
            fillColor: colorActual()
        });
    }
}


// Carga un polígono desde un archivo GeoJSON.
function dibujarPoligonoImportado(geo) {
    limpiar(false);

    try {
        const coords = turf.coordAll(geo);

        if (!coords || coords.length < 3) {
            mostrarInfo("El archivo GeoJSON no contiene puntos suficientes.");
            return;
        }

        // Adaptamos las coordenadas al formato de Leaflet.
        let puntosGeoJSON = coords.map(([lng, lat]) => [lat, lng]);

        // Quitamos el punto repetido que cierra la figura.
        if (
            puntosGeoJSON.length > 3 &&
            puntosGeoJSON[0][0] === puntosGeoJSON[puntosGeoJSON.length - 1][0] &&
            puntosGeoJSON[0][1] === puntosGeoJSON[puntosGeoJSON.length - 1][1]
        ) {
            puntosGeoJSON.pop();
        }

        puntos = puntosGeoJSON;

        // Buscamos el nombre guardado en el archivo.
        const nombreImportado =
            geo.properties?.nombre ||
            geo.properties?.name ||
            geo.features?.[0]?.properties?.nombre ||
            geo.features?.[0]?.properties?.name ||
            "Polígono importado";

        $("nombrePoligono").value = nombreImportado;

        dibujarMarcadores();
        redibujarPoligono();

        if (poligono) {
            mapa.fitBounds(poligono.getBounds());
        }

        actualizarTabla();
        mostrarInfo("GeoJSON importado. Puedes editar sus puntos.");
    } catch (error) {
        console.error(error);
        mostrarInfo("Error al procesar la estructura del archivo GeoJSON.");
    }
}


// Obtiene la ubicación actual del usuario.
function ubicarUsuario() {
    $("direccion").textContent = "Buscando la ubicación...";
    $("estadoUbicacion").textContent =
        "Solicitando ubicación al navegador...";

    // Revisamos si el navegador permite obtener la ubicación.
    if (!("geolocation" in navigator)) {
        $("direccion").textContent =
            "Tu navegador no soporta geolocalización.";
        $("estadoUbicacion").textContent =
            "Geolocalización no disponible.";
        return;
    }

    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const punto = [latitude, longitude];

        // Guardamos las coordenadas para usarlas después.
        ultimaUbicacion = {
            lat: latitude,
            lon: longitude,
            accuracy
        };

        // Quitamos los elementos de la ubicación anterior.
        if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
        if (circuloPrecision) mapa.removeLayer(circuloPrecision);

        // Marcamos la ubicación en el mapa.
        marcadorUsuario = L.marker(punto)
            .addTo(mapa)
            .bindPopup("Estás aquí")
            .openPopup();

        // El círculo muestra el margen de precisión.
        circuloPrecision = L.circle(punto, {
            radius: accuracy,
            color: "#5795d5",
            fillOpacity: 0.1
        }).addTo(mapa);

        mapa.setView(punto, 17);

        // Mostramos las coordenadas y la precisión.
        $("coordenadas").textContent =
            `Latitud: ${latitude.toFixed(6)} | Longitud: ${longitude.toFixed(6)} | Precisión: ${Math.round(accuracy)} m`;

        $("direccion").textContent = "Ubicación obtenida.";

        $("estadoUbicacion").textContent =
            accuracy <= PRECISION_MAX
                ? `Ubicación disponible con precisión de ${Math.round(accuracy)} m.`
                : `Ubicación aproximada: precisión de ${Math.round(accuracy)} m.`;

        // Buscamos la dirección correspondiente.
        buscarDireccion(latitude, longitude);
    }, (err) => {
        // Mostramos un mensaje según el error.
        const mensajes = {
            1: "Permiso denegado.",
            2: "Ubicación no disponible.",
            3: "Tiempo de espera agotado."
        };

        $("direccion").textContent =
            mensajes[err.code] || "Error al obtener ubicación.";

        $("estadoUbicacion").textContent =
            `Error ${err.code}: ${err.message}`;
    }, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    });
}


// Busca la dirección usando las coordenadas.
async function buscarDireccion(lat, lon) {
    try {
        const url =
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=es&addressdetails=1`;

        const respuesta = await fetch(url);

        if (!respuesta.ok) {
            throw new Error("No se pudo consultar la dirección");
        }

        const datos = await respuesta.json();

        $("direccion").textContent =
            datos.display_name || "Dirección no encontrada.";
    } catch {
        $("direccion").textContent =
            "Ubicación obtenida; sin dirección de texto.";
    }
}


// Agrega un punto cuando hacemos clic en el mapa.
mapa.on("click", (evento) => {
    puntos.push([evento.latlng.lat, evento.latlng.lng]);

    dibujarMarcadores();
    redibujarPoligono();
    actualizarTabla();

    mostrarInfo(`${puntos.length} vértice(s) en total.`);
});


// Cierra el polígono y ajusta la vista.
function cerrarPoligono() {
    if (puntos.length < 3) return;

    redibujarPoligono();

    if (poligono) mapa.fitBounds(poligono.getBounds());

    mostrarInfo(`Polígono "${nombreActual()}" cerrado.`);
}


// Elimina el último punto agregado.
function deshacerPunto() {
    if (puntos.length === 0) return;

    puntos.pop();

    dibujarMarcadores();
    redibujarPoligono();
    actualizarTabla();

    mostrarInfo(`Quedan ${puntos.length} vértice(s).`);
}


// Borra los puntos y la figura para empezar de nuevo.
function limpiar(mostrarMensaje = true) {
    detenerVigilancia(false);

    puntos = [];

    vertices.forEach((v) => mapa.removeLayer(v));
    vertices = [];

    lineaGuia.setLatLngs([]);

    if (poligono) mapa.removeLayer(poligono);
    poligono = null;

    actualizarTabla();
    actualizarMedidas();
    actualizarBotones();

    if (mostrarMensaje) {
        mostrarInfo("Mapa limpio. Haz clic para empezar de nuevo.");
    }
}


// Descarga el polígono como archivo GeoJSON.
function exportar() {
    if (puntos.length < 3) return;

    const geo = aGeoJSON();
    const texto = JSON.stringify(geo, null, 2);

    const blob = new Blob([texto], {
        type: "application/geo+json"
    });

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = "poligono.geojson";

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    URL.revokeObjectURL(url);
}


// Actualiza el color cuando cambia el selector.
$("colorPoligono").addEventListener("input", aplicarEstiloPoligono);

// Actualiza los datos cuando cambia el nombre.
$("nombrePoligono").addEventListener("change", () => {
    actualizarMedidas();
});


// Agrega la ubicación actual como un punto del polígono.
function agregarVerticeUbicacion() {
    if (!ultimaUbicacion) {
        ubicarUsuario();
        mostrarInfo("Primero obtén tu ubicación y vuelve a intentarlo.");
        return;
    }

    puntos.push([ultimaUbicacion.lat, ultimaUbicacion.lon]);

    dibujarMarcadores();
    redibujarPoligono();
    actualizarTabla();

    mostrarInfo("Ubicación agregada como vértice.");
}


// Guarda los puntos, el nombre y el color en el navegador.
function guardarLocal() {
    const datos = {
        puntos,
        nombre: nombreActual(),
        color: colorActual(),
        cerrado: Boolean(poligono)
    };

    localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(datos));

    $("estadoGuardado").textContent = "Guardado local exitoso.";
}


// Recupera los datos guardados anteriormente.
function recuperarLocal() {
    const texto = localStorage.getItem(CLAVE_GUARDADO);

    if (!texto) {
        $("estadoGuardado").textContent = "No hay guardados previos.";
        return;
    }

    try {
        const datos = JSON.parse(texto);

        if (!Array.isArray(datos.puntos) || datos.puntos.length < 1) {
            throw new Error();
        }

        limpiar(false);

        puntos = datos.puntos;
        $("nombrePoligono").value = datos.nombre || "Mi polígono";
        $("colorPoligono").value = datos.color || "#d94f91";

        dibujarMarcadores();
        redibujarPoligono();
        actualizarTabla();

        $("estadoGuardado").textContent = "Polígono recuperado.";
    } catch {
        $("estadoGuardado").textContent = "Error al recuperar datos.";
    }
}


// Lee el archivo GeoJSON que selecciona el usuario.
function importarGeoJSON(evento) {
    const archivo = evento.target.files[0];

    if (!archivo) return;

    const lector = new FileReader();

    lector.onload = () => {
        try {
            const geo = JSON.parse(lector.result);
            dibujarPoligonoImportado(geo);
        } catch {
            mostrarInfo("El archivo no es un GeoJSON válido.");
        }
    };

    lector.readAsText(archivo);
}


// Comprueba si la ubicación está dentro o fuera del polígono.
function comprobarGeocerca(lat, lon) {
    if (puntos.length < 3) return;

    const geo = aGeoJSON();

    const dentro = turf.booleanPointInPolygon(
        turf.point([lon, lat]),
        geo
    );

    const estado = dentro ? "DENTRO" : "FUERA";

    $("estadoGeocerca").textContent =
        `Ubicación actual: ${estado} del polígono.`;

    // Avisa cuando el usuario cambia de estado.
    if (
        posicionAnteriorGeocerca !== null &&
        dentro !== posicionAnteriorGeocerca
    ) {
        alert(dentro
            ? "Aviso: Entraste al polígono."
            : "Aviso: Saliste del polígono.");
    }

    posicionAnteriorGeocerca = dentro;
}


// Empieza a revisar la ubicación continuamente.
function iniciarVigilancia() {
    if (puntos.length < 3) {
        mostrarInfo("Se requiere un polígono de mínimo 3 puntos.");
        return;
    }

    if (!("geolocation" in navigator)) return;
    if (watchId !== null) return;

    posicionAnteriorGeocerca = null;

    watchId = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude, accuracy } = pos.coords;

        // Ignoramos ubicaciones con demasiada imprecisión.
        if (accuracy > PRECISION_MAX) return;

        comprobarGeocerca(latitude, longitude);
    }, null, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    });

    actualizarBotones();
    $("estadoGeocerca").textContent = "Vigilancia activa.";
}


// Detiene el seguimiento de la ubicación.
function detenerVigilancia(actualizar = true) {
    if (watchId !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    posicionAnteriorGeocerca = null;

    if (actualizar) {
        actualizarBotones();
        $("estadoGeocerca").textContent = "Vigilancia detenida.";
    }
}


// Permite cambiar entre las pestañas.
pestanas.forEach((pestana) => {
    pestana.addEventListener("click", () => {
        const panelSeleccionado = pestana.dataset.panel;

        // Marcamos la pestaña seleccionada.
        pestanas.forEach((boton) => {
            boton.classList.toggle("activa", boton === pestana);
        });

        // Mostramos el panel elegido y ocultamos los demás.
        paneles.forEach((panel) => {
            panel.hidden = panel.id !== panelSeleccionado;
        });

        // Ajustamos el mapa cuando vuelve a mostrarse.
        setTimeout(() => mapa.invalidateSize(), 100);
    });
});


// Conectamos cada botón con su función.
$("btnUbicar").addEventListener("click", ubicarUsuario);
$("btnAgregarUbicacion").addEventListener("click", agregarVerticeUbicacion);
$("btnCerrar").addEventListener("click", cerrarPoligono);
$("btnDeshacer").addEventListener("click", deshacerPunto);
$("btnLimpiar").addEventListener("click", () => limpiar());
$("btnExportar").addEventListener("click", exportar);
$("btnGuardar").addEventListener("click", guardarLocal);
$("btnRecuperar").addEventListener("click", recuperarLocal);
$("archivoGeoJSON").addEventListener("change", importarGeoJSON);
$("btnVigilar").addEventListener("click", iniciarVigilancia);
$("btnPararVigilancia").addEventListener("click", () => detenerVigilancia());


// Al iniciar la página, actualizamos la tabla y los botones.
actualizarTabla();
actualizarBotones();
