Write-Host "Stopping node-a leader..."
docker stop node-a

Start-Sleep -Seconds 5

Write-Host "Refreshing health..."
curl.exe -X POST http://localhost:8080/lb/refresh-health

Write-Host ""
Write-Host "Electing new leader..."
curl.exe -X POST http://localhost:8080/raft/elect-leader

Write-Host ""
Write-Host "Trying write after leader failure..."
curl.exe -X POST http://localhost:8080/api/set `
  -H "Content-Type: application/json" `
  -d "{\"key\":\"after-leader-failure\",\"value\":\"write still works\"}"

Write-Host ""
Write-Host "Start node-a again manually when demo is done:"
Write-Host "docker start node-a"