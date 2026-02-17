# inCLASS 앱 빌드 aliases
# 이 파일을 실행하려면: PowerShell을 관리자 권한으로 열고
# Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# 그 다음: .\setup-aliases.ps1

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

# aliases를 바로 사용하려면 이 스크립트를 $PROFILE에 추가하세요
# 실행: notepad $PROFILE
# 그런 다음 위 함수들을 복사해서 붙여넣으세요
