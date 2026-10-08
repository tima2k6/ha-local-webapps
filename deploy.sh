#!/bin/sh
# The dashboard webapps live in two places:
#   Home Assistant  /config/www/webapps/  -> /local/webapps/<page>.html
#     what the dashboard popups and frames open: works away from home, and uses
#     the app's own login (climate.html natively; led-panel/bedtime via js/ha-app.js)
#   nginx .119      /var/www/html/ (git pull)
#     a fallback on the home network, with the token from js/ha-config.js
# /local is cached for 31 days: after deploying, bump ?v= in the dashboard links.
set -e
cd "$(dirname "$0")"
git push -q
ssh root@192.168.2.119 'cd /var/www/html && git pull -q'
DEST=//192.168.2.125/config/www/webapps
mkdir -p "$DEST/js"
cp climate.html led-panel.html bedtime.html \
   led-icon.png led-icon.svg led-icon-apple.png apple-touch-icon.png "$DEST/"
cp js/ha-app.js "$DEST/js/"
cp "READ ME FIRST - where to edit.txt" "$DEST/"
echo "Deployed to nginx and Home Assistant /local/webapps/"
