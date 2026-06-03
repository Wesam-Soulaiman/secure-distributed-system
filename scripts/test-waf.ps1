Write-Host "Testing WAF SQL Injection..."
curl.exe -i "http://localhost:8080/api/get/user?id=1%27%20OR%20%271%27=%271"

Write-Host "Testing WAF Suspicious User-Agent..."
curl.exe -i -A "sqlmap" http://localhost:8080/api/ping