Write-Host "Resetting Load Balancer stats..."
curl.exe -X POST http://localhost:8080/lb/reset-stats

Write-Host "Sending 12 requests..."
1..12 | ForEach-Object {
  curl.exe -s http://localhost:8080/api/ping
  Write-Host ""
}

Write-Host "Load Balancer status:"
curl.exe http://localhost:8080/lb/status