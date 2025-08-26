@echo off
setlocal enabledelayedexpansion

REM Định nghĩa đường dẫn tuyệt đối của mongodump
set "MONGO_PATH=C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe"

REM Lấy đường dẫn thư mục chứa file dump.bat
set "SCRIPT_DIR=%~dp0"

REM Đường dẫn đến file .env (cùng thư mục với dump.bat)
set "ENV_FILE=%SCRIPT_DIR%.env"

REM Kiểm tra xem file .env có tồn tại không
if not exist "%ENV_FILE%" (
    echo Error: File %ENV_FILE% not found!
    exit /b 1
)

REM Đọc các biến từ file .env (hỗ trợ dòng trống)
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    if not "%%A"=="" set "%%A=%%B"
)

REM Đặt OUTPUT_DIR là thư mục 'data' trong SCRIPT_DIR
set "OUTPUT_DIR=%SCRIPT_DIR%data"

REM --- XÓA FILE CŨ TRONG THƯ MỤC DATA ---
if exist "%OUTPUT_DIR%" (
    echo Cleaning up existing files in %OUTPUT_DIR%...
    del /q "%OUTPUT_DIR%\*" 2>nul
)

REM Tạo thư mục 'data' nếu chưa tồn tại
if not exist "%OUTPUT_DIR%" (
    mkdir "%OUTPUT_DIR%"
    if errorlevel 1 (
        echo Error: Could not create directory %OUTPUT_DIR%. Please check permissions.
        exit /b 1
    )
)

REM Lấy timestamp hiện tại
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set "TIMESTAMP=%datetime:~6,2%-%datetime:~4,2%-%datetime:~0,4%_%datetime:~8,2%-%datetime:~10,2%-%datetime:~12,2%"
set "OUTPUT_FILE=%OUTPUT_DIR%\%SOURCE_DATABASE%-%TIMESTAMP%.archive"

REM Authentication parameters (optional)
set "AUTH_PARAMS="
if defined SOURCE_USERNAME if defined SOURCE_PASSWORD (
    set "AUTH_PARAMS=--username %SOURCE_USERNAME% --password %SOURCE_PASSWORD% --authenticationDatabase admin"
) else (
    echo Warning: Username or password not set in %ENV_FILE%
)

REM In thông tin để debug
echo Dumping database with the following parameters:
echo Host: %SOURCE_HOST%
echo Port: %SOURCE_PORT%
echo Database: %SOURCE_DATABASE%
echo Output: %OUTPUT_FILE%
echo Auth: %AUTH_PARAMS%

REM Kiểm tra xem mongodump có tồn tại không
if not exist "%MONGO_PATH%" (
    echo Error: mongodump not found at %MONGO_PATH%
    exit /b 1
)

REM Thực hiện dump database
"%MONGO_PATH%" --host "%SOURCE_HOST%" --port "%SOURCE_PORT%" %AUTH_PARAMS% --db "%SOURCE_DATABASE%" --gzip --archive="%OUTPUT_FILE%"

if errorlevel 1 (
    echo Error: Failed to dump database %SOURCE_DATABASE%
    exit /b 1
)

echo Database %SOURCE_DATABASE% dumped successfully to %OUTPUT_FILE%
exit /b 0
