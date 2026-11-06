# Local Windows OCR. Input: JSON array of image paths. Output: JSON result array.
param([switch]$Server)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($operation, [Type]$resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.Wait()
    return $task.Result
}
$language = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Where-Object { $_.LanguageTag -like 'ko*' } | Select-Object -First 1
if ($null -eq $language) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
else { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language) }
if ($null -eq $engine) { throw 'Windows OCR language is unavailable. Install Korean language OCR in Windows settings.' }
function Read-Images($paths) {
$result = @()
foreach ($path in $paths) {
    $stream = $null; $writer = $null; $bitmap = $null; $converted = $null
    try {
        # Decode a memory copy so WinRT cannot retain a lock on the next capture file.
        $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
        $writer = [Windows.Storage.Streams.DataWriter]::new($stream)
        $writer.WriteBytes([System.IO.File]::ReadAllBytes([string]$path))
        $null = Await ($writer.StoreAsync()) ([uint32])
        $null = $writer.DetachStream()
        $stream.Seek(0)
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $converted = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bitmap, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8)
        $ocr = Await ($engine.RecognizeAsync($converted)) ([Windows.Media.Ocr.OcrResult])
        $result += @{path=[string]$path; text=$ocr.Text; language=$engine.RecognizerLanguage.LanguageTag; error=$null}
    } catch { $result += @{path=[string]$path; text=''; language=$engine.RecognizerLanguage.LanguageTag; error=$_.Exception.Message} }
    finally { if ($writer) {$writer.Dispose()}; if ($converted) {$converted.Dispose()}; if ($bitmap) {$bitmap.Dispose()}; if ($stream) {$stream.Dispose()} }
}
return ConvertTo-Json -InputObject @($result) -Depth 5 -Compress

}
if ($Server) {
    while ($null -ne ($line = [Console]::In.ReadLine())) {
        $paths = @($line | ConvertFrom-Json)
        [Console]::WriteLine((Read-Images $paths))
        [Console]::Out.Flush()
    }
} else {
    $paths = @([Console]::In.ReadToEnd() | ConvertFrom-Json)
    Read-Images $paths
}
