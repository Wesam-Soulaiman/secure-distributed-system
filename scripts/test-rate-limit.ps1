Write-Host "Testing Rate Limiting..."

1..40 | ForEach-Object {
  curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8080/api/ping
}