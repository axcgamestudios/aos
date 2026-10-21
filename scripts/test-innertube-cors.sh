#!/bin/bash
# Test 1: Innertube CORS — can a browser on github.io call youtubei/v1 directly?
KEY="AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
ORIGIN="https://axcgamestudios.github.io"

echo "=== T1: innertube PLAYER (ANDROID client) CORS headers ==="
curl -s -D /tmp/h1.txt -o /tmp/b1.txt -X POST \
  "https://www.youtube.com/youtubei/v1/player?key=$KEY&prettyPrint=false" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  --max-time 15 \
  -d '{"context":{"client":{"clientName":"ANDROID","clientVersion":"19.09.37","androidSdkVersion":30,"hl":"es","gl":"US"}},"videoId":"aqz-KE-bpKQ"}'
grep -i -E "^(HTTP|access-control|content-type)" /tmp/h1.txt
echo "--- body keys ---"
python3 -c "
import json
d=json.load(open('/tmp/b1.txt'))
print('status:', d.get('playabilityStatus',{}).get('status'))
sd=d.get('streamingData',{})
fmts=sd.get('formats',[]) or []
adps=sd.get('adaptiveFormats',[]) or []
print('formats:', [(f.get('itag'), f.get('mimeType','')[:30], ('url' in f and 'has-url') or ('signatureCipher' in f and 'CIPHERED')) for f in fmts])
print('adaptive count:', len(adps), [(a.get('itag'), 'url' in a and 'has-url' or ('signatureCipher' in a and 'CIPHERED')) for a in adps[:5]])
v=d.get('videoDetails',{})
print('title:', v.get('title'), '| author:', v.get('author'), '| length:', v.get('lengthSeconds'))
"

echo ""
echo "=== T2: innertube BROWSE (home feed) CORS ==="
curl -s -D /tmp/h2.txt -o /tmp/b2.txt -X POST \
  "https://www.youtube.com/youtubei/v1/browse?key=$KEY&prettyPrint=false" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  --max-time 15 \
  -d '{"context":{"client":{"clientName":"ANDROID","clientVersion":"19.09.37","androidSdkVersion":30,"hl":"es","gl":"US"}},"browseId":"FEtrending"}'
grep -i -E "^(HTTP|access-control)" /tmp/h2.txt
python3 -c "
import json
d=json.load(open('/tmp/b2.txt'))
s=json.dumps(d)
print('response size:', len(s), '| has videoRenderer:', 'videoRenderer' in s, '| watchNext:', 'watch?v=' in s)
"

echo ""
echo "=== T3: innertube SEARCH CORS ==="
curl -s -D /tmp/h3.txt -o /tmp/b3.txt -X POST \
  "https://www.youtube.com/youtubei/v1/search?key=$KEY&prettyPrint=false" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  --max-time 15 \
  -d '{"context":{"client":{"clientName":"ANDROID","clientVersion":"19.09.37","androidSdkVersion":30,"hl":"es","gl":"US"}},"query":"minecraft gameplay"}'
grep -i -E "^(HTTP|access-control)" /tmp/h3.txt
python3 -c "
import json
d=json.load(open('/tmp/b3.txt'))
s=json.dumps(d)
print('response size:', len(s), '| videoRenderer:', s.count('videoRenderer'))
"
