param([int]$Port = 8080)

$root = Join-Path $PSScriptRoot "web"

if (-not (Test-Path $root)) {
    Write-Host "ERROR: No se encontro la carpeta 'web'." -ForegroundColor Red
    Write-Host "Asegurate de ejecutar INICIAR.bat desde la carpeta landing-page." -ForegroundColor Yellow
    Read-Host "Presiona Enter para cerrar"
    exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
} catch {
    Write-Host "ERROR: Puerto $Port en uso. Prueba cerrando otros programas o edita INICIAR.bat para usar otro puerto." -ForegroundColor Red
    Read-Host "Presiona Enter para cerrar"
    exit 1
}

Start-Process "http://localhost:$Port/"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "   ralvye.com  |  Servidor local activo" -ForegroundColor Cyan
Write-Host "   http://localhost:$Port/" -ForegroundColor Green
Write-Host "   Cierra esta ventana para detener" -ForegroundColor Yellow
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript'
    '.css'  = 'text/css'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.ico'  = 'image/x-icon'
    '.svg'  = 'image/svg+xml'
    '.glb'  = 'model/gltf-binary'
    '.wasm' = 'application/wasm'
    '.json' = 'application/json'
    '.txt'  = 'text/plain; charset=utf-8'
    '.xml'  = 'application/xml'
    '.map'  = 'application/json'
}

while ($listener.IsListening) {
    try {
        $context  = $listener.GetContext()
        $request  = $context.Request
        $response = $context.Response

        $url = $request.Url.LocalPath
        if ($url -eq '/') { $url = '/index.html' }

        # Prevenir path traversal
        $safePath  = $url.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $filePath  = [System.IO.Path]::GetFullPath((Join-Path $root $safePath))
        if (-not $filePath.StartsWith($root)) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext   = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime  = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType      = $mime
            $response.ContentLength64  = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $url")
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.Close()

    } catch [System.Threading.ThreadAbortException] {
        break
    } catch {
        try { $response.Close() } catch {}
    }
}

$listener.Stop()
