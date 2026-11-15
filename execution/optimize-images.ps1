Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $projectRoot 'Imagens/optimized'
[System.IO.Directory]::CreateDirectory($destination) | Out-Null
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
foreach ($name in @('02', '03')) {
    $source = [System.Drawing.Image]::FromFile((Join-Path $projectRoot "Imagens/$name.png"))
    try {
        foreach ($width in @(480, 960)) {
            $height = [int][Math]::Round($source.Height * $width / $source.Width)
            $bitmap = New-Object System.Drawing.Bitmap($width, $height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.DrawImage($source, 0, 0, $width, $height)
                $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 84L)
                $bitmap.Save((Join-Path $destination "$name-$width.jpg"), $encoder, $parameters)
            } finally {
                $parameters.Dispose()
                $graphics.Dispose()
                $bitmap.Dispose()
            }
        }
    } finally { $source.Dispose() }
}
Get-ChildItem -LiteralPath $destination | Select-Object Name, Length
