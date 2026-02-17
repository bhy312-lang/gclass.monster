# PowerShell 세션에서 사용할 alias 정의
# 이 스크립트를 실행하면 이 세션에서 'anda', 'andp' 사용 가능

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

Write-Host "✅ alias가 설정되었습니다. 이제 'anda'와 'andp'를 사용할 수 있습니다." -ForegroundColor Green
Write-Host "⚠️ 주의: 이 터미널을 닫으면 설정이 초기화됩니다." -ForegroundColor Yellow
