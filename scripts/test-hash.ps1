$keys = @("course", "student", "project", "user-1", "user-2", "payment-55", "raft")

foreach ($key in $keys) {
  Write-Host "Testing key: $key"
  curl.exe http://localhost:8080/lb/hash/$key
  Write-Host ""
}