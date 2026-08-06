# Mint an MCP-audience token exactly as a spec-compliant client would.
API=http://localhost:8080/api/v1
S=/private/tmp/claude-501/-Users-levkaplun-Desktop-BranderUX-BranderUX-client/d1bc5903-5d5a-4bde-a047-6bfdd5ac7b8c/scratchpad
AUTHH="Authorization: Bearer $(cat $S/user-token.txt)"
MCP_RES="http://localhost:3010/mcp"
CID=$(curl -s -X POST "$API/oauth/register" -H "Content-Type: application/json" -d '{"client_name":"MCP Suite","redirect_uris":["http://localhost:9999/cb"]}' | python3 -c "import sys,json;print(json.load(sys.stdin)['client_id'])")
V=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))")
C=$(python3 -c "import hashlib,base64;print(base64.urlsafe_b64encode(hashlib.sha256('$V'.encode()).digest()).rstrip(b'=').decode())")
CODE=$(curl -s -i -X POST "$API/oauth/authorize/decision" -H "$AUTHH" --data-urlencode "approve=true" --data-urlencode "client_id=$CID" --data-urlencode "redirect_uri=http://localhost:9999/cb" --data-urlencode "scope=account:read projects:read projects:write elements:read elements:write keys:manage" --data-urlencode "code_challenge=$C" --data-urlencode "code_challenge_method=S256" --data-urlencode "resource=$MCP_RES" | grep -i "^location" | tr -d '\r' | sed 's/.*code=//;s/&.*//')
curl -s -X POST "$API/oauth/token" --data-urlencode "grant_type=authorization_code" --data-urlencode "code=$CODE" --data-urlencode "redirect_uri=http://localhost:9999/cb" --data-urlencode "client_id=$CID" --data-urlencode "code_verifier=$V" --data-urlencode "resource=$MCP_RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])"
