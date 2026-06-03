Write-Host "Setting replicated key..."
curl.exe -X POST http://localhost:8080/api/set `
  -H "Content-Type: application/json" `
  -d "{\"key\":\"script-raft-test\",\"value\":\"replicated from script\"}"

Write-Host ""
Write-Host "Raft logs through gateway:"
curl.exe http://localhost:8080/raft/logs