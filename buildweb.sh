rm -rf assets/* && rmdir assets 2>/dev/null; rm -f index.html && cd website && pwd && npm i && npm run build && ls -al dist && cp -rf dist/* .. && cd ..
