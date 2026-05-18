from PIL import Image
import math

# La pantalla del CRT mide ~31x27 unidades 3D (1 pixel = 1 unidad)
# Usamos 28x22 para dejar margen
W, H = 28, 22
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
pixels = img.load()

# Nota: snap() en main.js convierte valores >180 a 255 (blanco). Usar <=160.
HULL = (155, 150, 140, 255)  # → snap a (160, 160, 128) — gris acero
MID  = (96,  92,  84,  255)  # → snap a (96, 96, 96)    — gris oscuro
DARK = (42,  40,  36,  255)  # → snap a (32, 32, 32)    — casi negro
BLUE = (80,  128, 160, 255)  # → snap a (96, 128, 160)  — azul cockpit

def px(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        pixels[x, y] = c

# Halcon Milenario top-down — mandibles a la izquierda, cockpit arriba-derecha
# Cuerpo principal (disco)
hull_pixels = [
    (10,3),(11,3),(12,3),(13,3),(14,3),(15,3),
    (8,4),(9,4),(10,4),(11,4),(12,4),(13,4),(14,4),(15,4),(16,4),(17,4),
    (7,5),(8,5),(9,5),(10,5),(11,5),(12,5),(13,5),(14,5),(15,5),(16,5),(17,5),(18,5),
    (7,6),(8,6),(9,6),(10,6),(11,6),(12,6),(13,6),(14,6),(15,6),(16,6),(17,6),(18,6),
    (6,7),(7,7),(8,7),(9,7),(10,7),(11,7),(12,7),(13,7),(14,7),(15,7),(16,7),(17,7),(18,7),(19,7),
    (6,8),(7,8),(8,8),(9,8),(10,8),(11,8),(12,8),(13,8),(14,8),(15,8),(16,8),(17,8),(18,8),(19,8),
    (6,9),(7,9),(8,9),(9,9),(10,9),(11,9),(12,9),(13,9),(14,9),(15,9),(16,9),(17,9),(18,9),(19,9),
    (6,10),(7,10),(8,10),(9,10),(10,10),(11,10),(12,10),(13,10),(14,10),(15,10),(16,10),(17,10),(18,10),(19,10),
    (6,11),(7,11),(8,11),(9,11),(10,11),(11,11),(12,11),(13,11),(14,11),(15,11),(16,11),(17,11),(18,11),(19,11),
    (6,12),(7,12),(8,12),(9,12),(10,12),(11,12),(12,12),(13,12),(14,12),(15,12),(16,12),(17,12),(18,12),(19,12),
    (7,13),(8,13),(9,13),(10,13),(11,13),(12,13),(13,13),(14,13),(15,13),(16,13),(17,13),(18,13),
    (7,14),(8,14),(9,14),(10,14),(11,14),(12,14),(13,14),(14,14),(15,14),(16,14),(17,14),(18,14),
    (8,15),(9,15),(10,15),(11,15),(12,15),(13,15),(14,15),(15,15),(16,15),(17,15),
    (9,16),(10,16),(11,16),(12,16),(13,16),(14,16),(15,16),(16,16),
    (11,17),(12,17),(13,17),(14,17),
]
for (x,y) in hull_pixels:
    px(x, y, HULL)

# Panel detalle (mid grey en anillo interior)
mid_pixels = [
    (11,5),(12,5),(13,5),(14,5),
    (10,6),(11,6),(12,6),(13,6),(14,6),(15,6),
    (9,7),(10,7),(15,7),(16,7),
    (9,8),(16,8),
    (9,9),(16,9),
    (9,10),(16,10),
    (9,11),(16,11),
    (9,12),(16,12),
    (10,13),(15,13),
    (11,14),(12,14),(13,14),(14,14),
]
for (x,y) in mid_pixels:
    px(x, y, MID)

# Centro del disco (detalle)
px(12, 9,  DARK)
px(13, 9,  DARK)
px(12, 10, DARK)
px(13, 10, DARK)

# Mandibula superior (izquierda)
for x in range(2, 8):
    px(x, 6,  HULL)
    px(x, 7,  MID)
# Mandibula inferior (izquierda)
for x in range(2, 8):
    px(x, 14, HULL)
    px(x, 13, MID)

# Cockpit (arriba-derecha, pequeño circulo azul)
px(20, 6, HULL)
px(21, 6, HULL)
px(20, 7, BLUE)
px(21, 7, BLUE)
px(20, 8, HULL)
px(21, 8, HULL)

# Motores (derecha)
px(20, 10, DARK)
px(21, 10, DARK)
px(20, 11, DARK)
px(21, 11, DARK)
px(20, 12, DARK)
px(21, 12, DARK)

# Plato de radar (encima del casco)
px(13, 3, MID)

img.save("public/millennium-falcon.png")
print(f"Halcon Milenario generado: {W}x{H}px (ajustado a la pantalla CRT)")
