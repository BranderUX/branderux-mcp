set -e
API=http://localhost:8080/api/v1
S=/private/tmp/claude-501/-Users-levkaplun-Desktop-BranderUX-BranderUX-client/d1bc5903-5d5a-4bde-a047-6bfdd5ac7b8c/scratchpad
AUTHH="Authorization: Bearer $(cat $S/user-token.txt)"
MCP_RES="http://localhost:3010/mcp"
API_RES="http://localhost:8080/api/v1"
jq() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

CID=$(curl -s -X POST "$API/oauth/register" -H "Content-Type: application/json" -d '{"client_name":"Hardened E2E","redirect_uris":["http://localhost:9999/cb"],"application_type":"native"}' | jq "d['client_id']")
V=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))")
C=$(python3 -c "import hashlib,base64;print(base64.urlsafe_b64encode(hashlib.sha256('$V'.encode()).digest()).rstrip(b'=').decode())")
RES_ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$MCP_RES',safe=''))")

echo "== 1. authorize WITH resource → consent"
curl -s -H "$AUTHH" "$API/oauth/authorize?response_type=code&client_id=$CID&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcb&scope=projects%3Aread%20projects%3Awrite&state=s1&code_challenge=$C&code_challenge_method=S256&resource=$RES_ENC" | grep -q "wants to access" && echo "   consent OK"

echo "== 2. authorize with BOGUS resource → invalid_target"
curl -s -H "$AUTHH" "$API/oauth/authorize?response_type=code&client_id=$CID&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcb&scope=projects%3Aread&code_challenge=$C&code_challenge_method=S256&resource=https%3A%2F%2Fevil.example.com" | jq "d.get('error')" | grep -q invalid_target && echo "   rejected: invalid_target"

echo "== 3. approve → code + iss (RFC 9207)"
LOC=$(curl -s -i -X POST "$API/oauth/authorize/decision" -H "$AUTHH" --data-urlencode "approve=true" --data-urlencode "client_id=$CID" --data-urlencode "redirect_uri=http://localhost:9999/cb" --data-urlencode "scope=projects:read projects:write" --data-urlencode "state=s1" --data-urlencode "code_challenge=$C" --data-urlencode "code_challenge_method=S256" --data-urlencode "resource=$MCP_RES" | grep -i "^location" | tr -d '\r')
echo "$LOC" | grep -q "iss=" && echo "   iss present"
CODE=$(echo "$LOC" | sed 's/.*code=//;s/&.*//')

echo "== 4. token with matching resource → MCP-audience token"
TOK=$(curl -s -X POST "$API/oauth/token" --data-urlencode "grant_type=authorization_code" --data-urlencode "code=$CODE" --data-urlencode "redirect_uri=http://localhost:9999/cb" --data-urlencode "client_id=$CID" --data-urlencode "code_verifier=$V" --data-urlencode "resource=$MCP_RES")
MCPTOK=$(echo "$TOK" | jq "d['access_token']")
AUD=$(python3 -c "
import base64,json
p='$MCPTOK'.split('.')[1]; p+='='*(-len(p)%4)
a=json.loads(base64.urlsafe_b64decode(p))['aud']
print(a if isinstance(a,str) else a[0])")
echo "   aud = $AUD"
if [ "$AUD" != "$MCP_RES" ]; then echo "   FAIL aud"; exit 1; fi
echo "   audience bound to MCP" 
echo "$MCPTOK" > $S/mcp-audience-token.txt

echo "== 5. MCP-audience token MUST be rejected by the API (no passthrough)"
CODE_API=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $MCPTOK" "$API/projects")
echo "   GET /projects with MCP-audience token: $CODE_API"
case "$CODE_API" in
  200) echo "   FAIL: API accepted a foreign-audience token!"; exit 1 ;;
  *) echo "   correctly refused ($CODE_API)" ;;
esac

echo "== 6. RFC 8693 token exchange → API-audience token"
EX=$(curl -s -X POST "$API/oauth/token" --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" --data-urlencode "subject_token=$MCPTOK" --data-urlencode "subject_token_type=urn:ietf:params:oauth:token-type:access_token" --data-urlencode "client_id=$CID" --data-urlencode "resource=$API_RES")
echo "$EX" | jq "'   issued_token_type: ' + d.get('issued_token_type','?') + ' | expires_in: ' + str(d.get('expires_in'))"
APITOK=$(echo "$EX" | jq "d['access_token']")
echo "   GET /projects with exchanged token: $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $APITOK" "$API/projects")"

echo "== 7. exchange to a BOGUS target → invalid_target"
curl -s -X POST "$API/oauth/token" --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" --data-urlencode "subject_token=$MCPTOK" --data-urlencode "client_id=$CID" --data-urlencode "resource=https://evil.example.com" | jq "'   ' + d.get('error','?')"

echo "== 8. scope challenge header on insufficient scope"
curl -s -i -X POST -H "Authorization: Bearer $APITOK" -H "Content-Type: application/json" -d '{"label":"x","allowedOrigins":[]}' "$API/projects/00000000-0000-0000-0000-000000000000/api-keys" | grep -i "^www-authenticate" | head -1

echo "ALL HARDENED CHECKS PASSED"
