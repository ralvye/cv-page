# CV en 3D · ralvye

Página personal de Rodrigo Alvear Yévenes con forma de juego de conducción:
manejas un auto por una isla nocturna y, al pasar por cada anillo de colores,
se abre una sección del CV.

Demo local: abrir `web/index.html` con el servidor incluido (`INICIAR.bat` en Windows).

## Controles

- **Teclado:** flechas o `W A S D` para acelerar, frenar/retroceder y girar.
- **Celular:** botones táctiles de la pantalla.
- **Barra inferior:** flechas `←` `→` y puntos para saltar directo a una sección.

## Estructura

```
cv-page/
├── INICIAR.bat        Lanzador para Windows (sirve web/ en localhost:8080)
├── servidor.ps1       Servidor HTTP en PowerShell
├── INSTRUCCIONES.txt  Guía de uso para Windows
├── web/               Sitio compilado, listo para publicar
└── source/            Código fuente (Vite + Three.js)
    ├── index.html
    ├── public/        Archivos estáticos (cv.html, sitemap, robots, imágenes)
    └── src/
        ├── main.js    Escena 3D, física del auto, cámara y texturas
        ├── content.js Textos del CV (aquí se edita el contenido)
        └── style.css  Tarjeta, barra de navegación y botones táctiles
```

## Desarrollo

Requiere Node.js 18 o superior.

```bash
cd source
npm install
npm run dev       # servidor de desarrollo en http://localhost:5173
npm run build     # genera source/dist/
```

Para publicar, copia el contenido de `source/dist/` dentro de `web/`
(reemplazando los archivos anteriores).

## Modificar el contenido

Edita `source/src/content.js`. Cada entrada de `stations` es una sección
con `label`, `title`, `lead` y `blocks` (textos, listas, empleos o enlaces).
Cada entrada corresponde a un anillo en la isla, en el mismo orden.

## Créditos

La estética y la mecánica de conducción se inspiran en
[folio-2025](https://github.com/brunosimon/folio-2025) de Bruno Simon (MIT).
No se copió código ni modelos de ese proyecto: la escena es una implementación nueva.
