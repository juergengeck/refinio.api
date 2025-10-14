$env:REFINIO_INSTANCE_DIRECTORY = "C:\Users\juerg\AppData\Roaming\one-filer-test-client"
$env:REFINIO_API_PORT = "17892"
$env:REFINIO_COMM_SERVER_URL = "ws://localhost:8000"

Write-Host "Environment variables set:"
Write-Host "  REFINIO_INSTANCE_DIRECTORY=$env:REFINIO_INSTANCE_DIRECTORY"
Write-Host "  REFINIO_API_PORT=$env:REFINIO_API_PORT"
Write-Host "  REFINIO_COMM_SERVER_URL=$env:REFINIO_COMM_SERVER_URL"
Write-Host ""
Write-Host "Starting node dist/index.js..."
Write-Host ""

node dist/index.js
