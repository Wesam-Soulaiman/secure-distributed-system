Write-Host "Stopping node-c..."
docker stop node-c

Start-Sleep -Seconds 5

Write-Host "Refreshing health..."
curl.exe -X POST http://localhost:8080/lb/refresh-health

Write-Host ""
Write-Host "Writing with one follower down..."
curl.exe -X POST http://localhost:8080/api/set `
  -H "Content-Type: application/json" `
  -d "{\"key\":\"majority-script-test\",\"value\":\"works with majority\"}"

Write-Host ""
Write-Host "Starting node-c again..."
docker start node-c