#!/bin/sh
# Downloads the Joinvoo videos (made on Higgsfield) into public/media so the homepage and guide show them.
# Run once on your server from the project folder:  sh scripts/fetch-media.sh
set -e
cd "$(dirname "$0")/../public/media"
B=https://d2ol7oe51mr4n9.cloudfront.net/user_3JVmdMKIj1cyS4KALmIV38nUmgH
curl -fL -o joinvoo-why.mp4   "$B/d7e7e1fd-fa98-4f0d-b024-8bfe7cd41d88.mp4"
curl -fL -o joinvoo-why.jpg   "$B/0e583bbf-fd8d-45b1-9340-e3a4d27e764d.jpg"
curl -fL -o joinvoo-guide.mp4 "$B/f7c4c713-20e0-46dc-9c30-cd05becfc249.mp4"
curl -fL -o joinvoo-guide.jpg "$B/a8b57e38-a80a-4260-8ec0-e9b299616c2d.jpg"
echo "Videos saved in public/media. They show on the homepage and guide straight away."
