$zipPath = Join-Path (Get-Location) "codex-changes.zip"
$stagePath = Join-Path $env:TEMP ("codex-changes-" + [guid]::NewGuid())

if (Test-Path -LiteralPath $zipPath -PathType Leaf) {
    Remove-Item -LiteralPath $zipPath -Force
}

$files = @(
    git diff --name-only --diff-filter=ACMRTUXB HEAD
    git ls-files --others --exclude-standard
) |
    Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
    Sort-Object -Unique

if ($files.Count -eq 0) {
    Write-Host "No added or modified files since HEAD."
    return
}

New-Item -ItemType Directory -Path $stagePath -Force | Out-Null

try {
    foreach ($file in $files) {
        $destination = Join-Path $stagePath $file
        $destinationDirectory = Split-Path -Parent $destination

        New-Item -ItemType Directory `
            -Path $destinationDirectory `
            -Force | Out-Null

        Copy-Item -LiteralPath $file -Destination $destination
    }

    Compress-Archive `
        -Path (Join-Path $stagePath "*") `
        -DestinationPath $zipPath `
        -Force

    Write-Host "Created: $zipPath"
    Write-Host "Included $($files.Count) files."
}
finally {
    Remove-Item -LiteralPath $stagePath -Recurse -Force -ErrorAction SilentlyContinue
}