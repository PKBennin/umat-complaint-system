# Lightweight PowerShell HTTP Server
$port = 8085
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
try {
    $listener.Start()
    Write-Host "Server started on http://127.0.0.1:$port/"
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/" -or $urlPath -eq "") {
            $urlPath = "/index.html"
        }
        
        # Clean urlPath and combine with current folder
        $cleanPath = $urlPath.Replace("/", "\")
        if ($cleanPath.StartsWith("\")) {
            $cleanPath = $cleanPath.Substring(1)
        }
        
        $filePath = Join-Path "C:\Users\UARB\.gemini\antigravity-ide\scratch\umat-complaint-system" $cleanPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Set mime type
            if ($filePath.EndsWith(".html")) {
                $response.ContentType = "text/html"
            } elseif ($filePath.EndsWith(".css")) {
                $response.ContentType = "text/css"
            } elseif ($filePath.EndsWith(".js")) {
                $response.ContentType = "application/javascript"
            } elseif ($filePath.EndsWith(".jpg") -or $filePath.EndsWith(".jpeg")) {
                $response.ContentType = "image/jpeg"
            } elseif ($filePath.EndsWith(".png")) {
                $response.ContentType = "image/png"
            } else {
                $response.ContentType = "application/octet-stream"
            }
            
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $html404 = "<html><body><h1>404 Not Found</h1><p>File $urlPath not found.</p></body></html>"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($html404)
            $response.ContentType = "text/html"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $response.Close()
    }
} catch {
    Write-Error "Failed to start listener: $_"
} finally {
    $listener.Close()
}
