#!/bin/sh
# Climate lives in two places:
#   Home Assistant  /config/www/climate/climate.html  -> /local/climate/climate.html
#     what the dashboard popups open: works away from home, uses the app's own login
#   nginx .119      /var/www/html/climate.html (git pull)
#     a fallback on the home network, with the token from js/ha-config.js
# After deploying, bump ?v= in the dashboard's Climate links if browsers might cache.
set -e
cd "$(dirname "$0")"
git push -q
ssh root@192.168.2.119 'cd /var/www/html && git pull -q'
cp climate.html //192.168.2.125/config/www/climate/climate.html
echo "Deployed climate.html to nginx and Home Assistant /local/climate/"
