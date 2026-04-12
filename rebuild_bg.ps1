[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$appDir = Get-ChildItem "C:\Users\Maxok\.gemini\antigravity\scratch\ContactOut-and-Lusha" -Directory | Where-Object { $_.Name -like "Email Finder*" } | Select-Object -First 1 -ExpandProperty FullName
$appDir = Join-Path $appDir "app"

Write-Host "App dir: $appDir"

$origPath = Join-Path $appDir "background_original.js"
$epPath = Join-Path $appDir "email_provider_bg.js"
$obPath = Join-Path $appDir "outreach_bg.js"
$outPath = Join-Path $appDir "background.js"

$orig = [System.IO.File]::ReadAllText($origPath, [System.Text.Encoding]::UTF8)
$ep = [System.IO.File]::ReadAllText($epPath, [System.Text.Encoding]::UTF8)
$ob = [System.IO.File]::ReadAllText($obPath, [System.Text.Encoding]::UTF8)

$nl = [char]10
$combined = $orig + $nl + $nl + "// === OutreachPro: Email Provider Handler ===" + $nl + $ep + $nl + $nl + "// === OutreachPro: Outreach BG Router ===" + $nl + $ob

[System.IO.File]::WriteAllText($outPath, $combined, [System.Text.Encoding]::UTF8)

Write-Host "Done! Combined background.js created."
Write-Host "Original: $($orig.Length) chars"
Write-Host "Email Provider: $($ep.Length) chars"
Write-Host "Outreach BG: $($ob.Length) chars"
Write-Host "Total: $($combined.Length) chars"
