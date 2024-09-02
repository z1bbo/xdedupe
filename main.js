const STORAGE_UPDATE_BATCH_SIZE = 20;
// Future development: make these configurable
// const DEDUPE_ON_CONTENT = false;
const DEFAULT_TTL_DAYS = 7;

const seen = new Map();
const childRemovedFlags = new Map();
let newCount = 0;
let lastScrollTime = 0;
let oldTweets = [];
let lastScrollY = 0;
let lastRemoveTime = 0;

let isNavigatingBack = false;

function handleScroll() {
  if (window.location.pathname !== "/home") {
    return;
  }
  const now = Date.now();
  const msSinceLastScroll = now - lastScrollTime;

  if (msSinceLastScroll < 200) {
    return;
  }
  const scrollDistance = window.scrollY - lastScrollY;
  if (scrollDistance * 333 / msSinceLastScroll > window.innerHeight) {
    lastScrollTime = now;
    lastScrollY = window.scrollY;
    return;
  }
  handleScrollTweetTransition();
  handleRemoveSeenTweetsBelow();

  lastScrollTime = now;
  lastScrollY = window.scrollY;
}

function handleScrollTweetTransition() {
  for (const tweet of oldTweets) {
    const rect = tweet.getBoundingClientRect();
    if (rect.height > 0 && rect.width > 0 &&rect.bottom < 160) {
      addSeen(tweet);
    }
  }
  oldTweets = getTweets();
}

function getTweets() {
  const tweets = document.querySelectorAll('article[role="article"][data-testid="tweet"]');
  return Array.from(tweets).filter(tweet => {
    const rect = tweet.getBoundingClientRect();
    return rect.bottom >= 160;
  });
}

function addSeen(tweet, ttlDays = DEFAULT_TTL_DAYS) {
  const id = getId(tweet);
  if (id === null) {
    console.log('cannot add seen tweet, invalid object ', tweet.innerText);
    return;
  }
  const expirationTime = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  seen.set(id, expirationTime);
  if (++newCount >= STORAGE_UPDATE_BATCH_SIZE) {
    storeSeen();
  }
  console.log('seen', id);
}

function getId(tweet) {
  const usernameHref = tweet.querySelector('[data-testid^="UserAvatar-Container-"]').querySelector('a[href]').href
  const username = usernameHref.split('/').pop();
  const analyticsHref = tweet.querySelector(`a[href^="/${username}/status/"][href$="/analytics"]`).href;
  const parts = analyticsHref.split('/');
  return parts[parts.length - 2];
}

function storeSeen() {
  localStorage.setItem('seenTweets', JSON.stringify([...seen]));
  newCount = 0;
};

function handleRemoveSeenTweetsBelow() {
  const now = Date.now();
  if (now - lastRemoveTime < 2000) {
    return;
  }
  lastRemoveTime = now;
  const tweets = getTweets();

  // skipping the last two since sometimes there are two-comment-long comment chains
  for (let i = tweets.length - 3; i >= 0; i--) {
    const bottomThreshold = Math.min(window.scrollY, window.innerHeight + 50);
    const tweet = tweets[i];
    const tweetTop = tweet.getBoundingClientRect().top;
    
    if (tweetTop > bottomThreshold && hasSeen(tweet)) {
      const tweetId = getId(tweet);
      if (!isParentTweet(tweet) || childRemovedFlags.get(tweetId)) {
        console.log('current y position', window.scrollY)
        console.log('removing tweet ', tweetId, ' at y position ', tweetTop, 'content: ', tweet.innerText);
        // TODO fix focus jumping even for removing below
        tweet.remove();
        
        const parentTweetId = i >= 1 ? getId(tweets[i - 1]) : null;
        if (parentTweetId !== null) {
          childRemovedFlags.set(parentTweetId, true);
        }
      } else if (isParentTweet(tweet)) {
        console.log('parent tweet ', tweetId, ' NOT REMOVING CUZ CHILD NOT REMOVED (TODO rem log)');
      }
    }
  }
}

function hasSeen(tweet) {
  const id = getId(tweet);
  if (id === null) {
    return false;
  }
  return !!seen.get(id);
}

function isParentTweet(tweet) {
  // if there are 2+ elements it contains the parent-tweet-side-arrow
  const profileAndSideArrow = tweet.children[0].children[0].children[1].children[0];
  return profileAndSideArrow.children.length >= 2;
}

// function getContentHash(tweet) {
//   const content = tweet.querySelector('[data-testid="tweetText"]').innerText;
//   // cyrb53 taken from https://stackoverflow.com/a/52171480/4054975
//   let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
//   for (const c of content) {
//     h1 = Math.imul(h1 ^ c, 2654435761);
//     h2 = Math.imul(h2 ^ c, 1597334677);
//   }
//   h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
//   h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
//   h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
//   h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

//   const contentHash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
//   return authorHandle + contentHash;
// }

// TODO what if multiple tabs open in parallel? re-load on tab switch?
function loadSeen() {
  const stored = JSON.parse(localStorage.getItem('seenTweets'));
  if (stored && Array.isArray(stored)) {
    const now = Date.now();
    stored.forEach(([id, expirationTime]) => {
      if (expirationTime > now) {
        seen.set(id, expirationTime);
      }
    });
  }
}

loadSeen();
window.addEventListener('scroll', handleScroll, { passive: true });
window.addEventListener('beforeunload', storeSeen);
