# XDedupe

Never see the same tweet twice in a row! XDedupe minifies and hides duplicate tweets that you have seen before in the last 7 days.

Once you scroll by a tweet, it gets stored as seen in indexedDb, i.e. locally on your browser. Then it minifies all tweets that you have already seen, everywhere below your current scroll position. One exception: The top tweet on the `/{user}/status/{id}` page doesn't get hidden.

Clicking on a minified tweet will restore it to the orignal tweet, and this tweet will not be re-hidden for this session.

If you have any questions/issues, please feel free to contact me or create an issue/PR etc.!

## Developing
### Issues
When clicking to a different page and back again in the same browser window, the minifications are undone. They will be re-done shortly after that, but it's not optimal.

To fix this originally I didn't add css styles etc. to minify the tweet, but made a DOM clone and replaced the orignal tweet with the clone, which prevents this undoing of the minfication. However, on browser back navigation the profile `<img>` tags in the cloned minified versions would disappear, for which I could not find a workaround.

### Icons

Colored icon created via Bing image generator. 

Commands to convert colored icon to grayscale, then add the OFF text
```
magick icon-48.png -colorspace Gray gray.png 
magick gray.png    \( -size 48x24 xc:'rgba(128,128,128,0.7)'      -gravity center -fill white -font Arial-Bold -pointsize 20 -annotate +0+0 'OFF' \)   -gravity northeast -composite gray-icon-48.png

magick icon-96.png -colorspace Gray gray.png 
magick gray.png    \( -size 96x48 xc:'rgba(128,128,128,0.7)'      -gravity center -fill white -font Arial-Bold -pointsize 40 -annotate +0+0 'OFF' \)   -gravity northeast -composite gray-icon-96.png
```