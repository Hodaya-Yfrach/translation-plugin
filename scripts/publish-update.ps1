<#
.SYNOPSIS
    מפרסם גרסה חדשה של FastTranslate AI באתר אמרי קודש, כך שכל המחשבים שהתוכנה מותקנת בהם יתעדכנו בשקט.

.DESCRIPTION
    מריצים מתיקיית הפרויקט:  npm run release:win
    עם פרמטרים:              npm run release:win -- -Bump minor -Notes "תיקון א|תיקון ב"

      1. בודק מה הגרסה שכבר באתר (latest.yml).
      2. מעלה את מספר הגרסה ב-package.json (ברירת מחדל: patch, למשל 1.0.0 -> 1.0.1).
      3. בונה מתקין: dist\FastTranslate-Setup-v<גרסה>.exe, וגם .blockmap ו-latest.yml.
      4. מעלה ל-R2 של האתר (downloads.imreykodesh.com/downloads/fasttranslate). latest.yml עולה אחרון,
         כך שהתוכנות המותקנות לא רואות גרסה חדשה לפני שהמתקין שלה כבר באתר.
      5. בודק שהאתר מגיש את הגרסה החדשה.
      6. שומר את מספר הגרסה ב-git ודוחף ל-GitHub (commit + tag).

    דרישות: node, git, ו-wrangler מחובר לחשבון Cloudflare (npm install -g wrangler ואז wrangler login).
    קוד יציאה: 0 הצלחה, 1 שגיאה.

.PARAMETER Bump
    patch (ברירת מחדל), minor, major, או none (לפרסם את הגרסה שכבר כתובה ב-package.json).

.PARAMETER Notes
    "מה חדש", מופרד ב-|. מוצג למשתמשים בחלון האודות כשהעדכון מוכן.

.PARAMETER NoGit
    לא לעשות commit ודחיפה של מספר הגרסה.
#>
param(
    [ValidateSet('patch', 'minor', 'major', 'none')]
    [string]$Bump = 'patch',
    [string]$Notes = '',
    [switch]$NoGit
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$R2Bucket = 'imreykodesh-downloads'
$R2Prefix = 'downloads/fasttranslate'
$PublicBase = "https://downloads.imreykodesh.com/$R2Prefix"

function Write-Step([string]$msg) { Write-Host ""; Write-Host "> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Err([string]$msg)  { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info([string]$msg) { Write-Host "       $msg" -ForegroundColor Gray }

# wrangler מותקן גלובלית (כמו בסקריפט הפרסום של גבי), ואם לא - דרך npx
function Invoke-Wrangler([string[]]$wranglerArgs) {
    if (Get-Command wrangler -ErrorAction SilentlyContinue) { & wrangler @wranglerArgs }
    else { & npx --yes wrangler @wranglerArgs }
}

function Get-YamlVersion([string]$text) {
    if ($text -match '(?m)^version:\s*[''"]?([0-9][0-9A-Za-z.\-]*)') { return $Matches[1] }
    return $null
}

# הגרסה שהאתר מגיש כרגע (null = עוד לא פורסם כלום)
function Get-LiveVersion {
    try {
        $r = Invoke-WebRequest -Uri "$PublicBase/latest.yml?t=$([DateTime]::UtcNow.Ticks)" -Headers @{ 'Cache-Control' = 'no-cache' } -UseBasicParsing -TimeoutSec 20
        $text = if ($r.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
        return Get-YamlVersion $text
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 404) { return $null }
        throw "לא הצלחתי לקרוא את הגרסה שבאתר: $($_.Exception.Message)"
    }
}

$root = Split-Path -Parent $PSScriptRoot
$notesFile = Join-Path $root 'build\release-notes.md'
$exitCode = 0
Push-Location -LiteralPath $root
try {
    # --- 0. כלים
    foreach ($tool in @('node', 'npm', 'git')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Write-Err "$tool לא נמצא ב-PATH."; $exitCode = 1; return }
    }
    $who = (Invoke-Wrangler @('whoami') 2>&1 | ForEach-Object { "$_" }) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $who -match 'not authenticated|not logged in') {
        Write-Err "wrangler לא מחובר ל-Cloudflare. הרץ פעם אחת: npm install -g wrangler ואז wrangler login"
        $exitCode = 1; return
    }

    # --- 1. הגרסה באתר
    Write-Step "בודק מה הגרסה שבאתר..."
    $live = Get-LiveVersion
    if ($live) { Write-Info "באתר כרגע: $live" } else { Write-Info "באתר עוד אין גרסה (פרסום ראשון)." }

    # --- 2. מספר גרסה
    if ($Bump -ne 'none') {
        & npm version $Bump --no-git-tag-version 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Err "npm version נכשל."; $exitCode = 1; return }
    }
    $version = (Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json).version
    if ($live -and [version]$live -ge [version]$version) {
        Write-Err "הגרסה $version לא חדשה יותר ממה שבאתר ($live). הרץ שוב עם -Bump patch/minor/major."
        $exitCode = 1; return
    }
    Write-Ok "גרסה לפרסום: $version"

    # --- 3. בנייה ("מה חדש" נכנס ל-latest.yml דרך build\release-notes.md)
    $changeList = @($Notes -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($changeList.Count) {
        [System.IO.File]::WriteAllText($notesFile, (($changeList | ForEach-Object { "• $_" }) -join "`n"), (New-Object System.Text.UTF8Encoding $false))
    } elseif (Test-Path -LiteralPath $notesFile) {
        Remove-Item -LiteralPath $notesFile -Force
    }

    Write-Step "בונה את המתקין (כמה דקות)..."
    & npm run build:win
    if ($LASTEXITCODE -ne 0) { Write-Err "הבנייה נכשלה (ראה את השגיאה למעלה)."; $exitCode = 1; return }

    $exeName = "FastTranslate-Setup-v$version.exe"
    $files = @(
        @{ Path = "dist\$exeName";          Key = $exeName;            Type = 'application/vnd.microsoft.portable-executable'; Cache = 'public, max-age=31536000, immutable' },
        @{ Path = "dist\$exeName.blockmap"; Key = "$exeName.blockmap"; Type = 'application/octet-stream';                      Cache = 'public, max-age=31536000, immutable' },
        @{ Path = 'dist\latest.yml';        Key = 'latest.yml';        Type = 'text/yaml; charset=utf-8';                      Cache = 'no-cache' }
    )
    foreach ($f in $files) {
        if (-not (Test-Path -LiteralPath $f.Path)) { Write-Err "חסר קובץ אחרי הבנייה: $($f.Path)"; $exitCode = 1; return }
    }
    $builtVersion = Get-YamlVersion (Get-Content -LiteralPath 'dist\latest.yml' -Raw -Encoding UTF8)
    if ($builtVersion -ne $version) { Write-Err "dist\latest.yml מצביע לגרסה $builtVersion ולא ל-$version."; $exitCode = 1; return }
    $size = (Get-Item -LiteralPath "dist\$exeName").Length
    Write-Ok ("נבנה: $exeName ({0:N1} MB)" -f ($size / 1MB))

    # --- 4. העלאה ל-R2 (latest.yml אחרון)
    Write-Step "מעלה לאתר ($PublicBase)..."
    foreach ($f in $files) {
        Invoke-Wrangler @('r2', 'object', 'put', "$R2Bucket/$R2Prefix/$($f.Key)", '--file', $f.Path, '--content-type', $f.Type, '--cache-control', $f.Cache, '--remote')
        if ($LASTEXITCODE -ne 0) { Write-Err "ההעלאה של $($f.Key) נכשלה. אפשר להריץ שוב עם -Bump none."; $exitCode = 1; return }
        Write-Ok "הועלה: $($f.Key)"
    }

    # --- 5. בדיקה באתר החי
    Write-Step "בודק שהאתר מגיש את $version..."
    $ok = $false
    for ($i = 0; $i -lt 12 -and -not $ok; $i++) {
        try { if ((Get-LiveVersion) -eq $version) { $ok = $true } } catch { }
        if (-not $ok) { Start-Sleep -Seconds 5 }
    }
    if (-not $ok) { Write-Warn "האתר עדיין לא מגיש את $version. בדוק את $PublicBase/latest.yml בעוד כמה דקות." }
    else {
        Write-Ok "האתר מגיש את $version."
        try {
            $head = Invoke-WebRequest -Uri "$PublicBase/$exeName" -Method Head -UseBasicParsing -TimeoutSec 30
            $len = [long]($head.Headers['Content-Length'] | Select-Object -First 1)
            if ($len -eq $size) { Write-Ok "המתקין נגיש: $PublicBase/$exeName" } else { Write-Warn "המתקין נגיש, אבל הגודל $len במקום $size." }
        } catch { Write-Warn "בדיקת המתקין נכשלה: $($_.Exception.Message) (בנטפרי קובץ חדש עשוי להיחסם עד לאישור)." }
    }

    # --- 6. git
    if (-not $NoGit -and $Bump -ne 'none') {
        Write-Step "שומר את מספר הגרסה ב-GitHub..."
        & git add -- package.json package-lock.json
        & git commit -m "Release v$version" -- package.json package-lock.json 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            & git tag "v$version" 2>&1 | Out-Null
            & git push --follow-tags 2>&1 | ForEach-Object { Write-Info "$_" }
            if ($LASTEXITCODE -eq 0) { Write-Ok "נדחף: Release v$version" } else { Write-Warn "הדחיפה נכשלה. הרץ git push --follow-tags ידנית." }
        } else { Write-Warn "לא נוצר commit לגרסה (אולי אין שינוי)." }
    }

    Write-Host ""
    Write-Ok "פורסם! התוכנות המותקנות יורידו את $version בבדיקה הבאה (תוך 6 שעות, או 'בדיקת עדכונים' בחלון האודות)."
}
catch {
    Write-Err "שגיאה לא צפויה: $($_.Exception.Message)"
    $exitCode = 1
}
finally {
    if (Test-Path -LiteralPath $notesFile) { Remove-Item -LiteralPath $notesFile -Force -ErrorAction SilentlyContinue }
    Pop-Location
    exit $exitCode
}
