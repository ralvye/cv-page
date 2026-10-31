# CV en 3D · ralvye

Página personal de Rodrigo Alvear Yévenes con forma de juego de conducción:
manejas un auto por una pista de carreras nocturna, con pasto a los costados,
y al pasar por cada icono del suelo se abre una sección del CV.

Demo local: abrir `web/index.html` con cualquier servidor estático (por ejemplo `npx serve web`).

## Controles

- **Teclado:** flechas o `W A S D` para acelerar, frenar/retroceder y girar.
- **Celular:** botones táctiles de la pantalla.
- **Barra inferior:** flechas `←` `→` y puntos para saltar directo a una sección.

## Estructura

```
cv-page/
├── INSTRUCCIONES.txt  Guía de uso
├── web/               Sitio compilado, listo para publicar
└── source/            Código fuente (Vite + Three.js)
    ├── index.html
    ├── public/        Archivos estáticos (cv.html, sitemap, robots, imágenes)
    └── src/
        ├── main.js    Escena 3D, física del auto, cámara y pista
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
Cada entrada corresponde a un icono en el suelo, en el mismo orden.
Las redes sociales están en `socials` del mismo archivo.

## Créditos

Este proyecto usa assets de [folio-2025](https://github.com/brunosimon/folio-2025)
de Bruno Simon:

- `source/public/favicons/` (íconos de la pestaña)

El modelo del auto y sus matcaps (`source/public/vehicle/2019/` y
`source/public/vehicle/matcaps/`) provienen de [folio-2019](https://github.com/brunosimon/folio-2019)
de Bruno Simon, también bajo licencia MIT.

El código de la escena (`source/src/`) fue escrito para este proyecto, inspirado en el juego de Bruno.
