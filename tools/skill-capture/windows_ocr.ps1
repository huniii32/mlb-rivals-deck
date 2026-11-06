# Local Windows OCR. Input: JSON array of image paths. Output: JSON result array.
param([switch]$Server)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
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
    $stream = $null; $bitmap = $null; $converted = $null
    try {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync([string]$path)) ([Windows.Storage.StorageFile])
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $converted = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bitmap, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8)
        $ocr = Await ($engine.RecognizeAsync($converted)) ([Windows.Media.Ocr.OcrResult])
        $result += @{path=[string]$path; text=$ocr.Text; language=$engine.RecognizerLanguage.LanguageTag; error=$null}
    } catch { $result += @{path=[string]$path; text=''; language=$engine.RecognizerLanguage.LanguageTag; error=$_.Exception.Message} }
    finally { if ($converted) {$converted.Dispose()}; if ($bitmap) {$bitmap.Dispose()}; if ($stream) {$stream.Dispose()} }
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
