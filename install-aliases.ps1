# PowerShell 프로필에 anda/andp aliases 추가
# 관리자 권한으로 실행 필요: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

$profilePath = $PROFILE
$profileDir = Split-Path $profilePath -Parent

# 프로필 디렉토리가 없으면 생성
if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

# 이미 추가되었는지 확인
$profileContent = ""
if (Test-Path $profilePath) {
    $profileContent = Get-Content $profilePath -Raw
}

if ($profileContent -notmatch "function anda") {
    $aliases = @"

# inCLASS 앱 빌드 aliases
function anda {
    cd apps\admin-app
    npx cap build android
    cd ..\..
}

function andp {
    cd apps\parent-app
    npx cap build android
    cd ..\..
}
"@

    Add-Content -Path $profilePath -Value $aliases
    Write-Host "✅_aliases가 프로필에 추가되었습니다: $profilePath" -ForegroundColor Green
    Write-Host "새 터미널을 열면 'anda'와 'andp'를 사용할 수 있습니다." -ForegroundColor Yellow
} else {
    Write-Host "ℹ️_aliases가 이미 존재합니다." -ForegroundColor Cyan
}
