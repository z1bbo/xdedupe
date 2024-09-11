const STORAGE_UPDATE_BATCH_SIZE = 20;
// Future development: make these configurable
// const DEDUPE_ON_CONTENT = false;
const DEFAULT_TTL_DAYS = 7;

const seen = new Map();
const undoneTweets = new Set();
let newCount = 0;
let lastScrollTime = 0;
let oldTweets = [];
let lastScrollY = 0;

function handleScroll() {
  if (window.location.pathname !== "/home") {
    return;
  }
  const now = Date.now();
  const msSinceLastScroll = now - lastScrollTime;

  if (msSinceLastScroll < 100) {
    return;
  }
  const scrollDistance = window.scrollY - lastScrollY;
  if (Math.abs(scrollDistance * 300 / msSinceLastScroll) > window.innerHeight) {
    lastScrollTime = now;
    lastScrollY = window.scrollY;
    return;
  }
  handleRemoveSeenTweetsBelow();
  handleScrollTweetTransition();

  lastScrollTime = now;
  lastScrollY = window.scrollY;
}

function handleScrollTweetTransition() {
  for (const tweet of oldTweets) {
    const rect = tweet.getBoundingClientRect();
    if (rect.height > 0 && rect.width > 0 && rect.bottom < 160) {
      addSeen(tweet);
    }
  }
  oldTweets = getTweets();
}

function getTweets() {
  const tweets = document.querySelectorAll('article[role="article"][data-testid="tweet"]');
  // all tweets below the current scroll position, where still at least a part is visible at the bottom
  return Array.from(tweets)
    .reduce((acc, tweet) => {
      if (acc.length > 0 || tweet.getBoundingClientRect().bottom >= 160) {
        acc.push(tweet);
      }
      return acc;
    }, []);
}

function addSeen(tweet, ttlDays = DEFAULT_TTL_DAYS) {
  const id = getId(tweet);
  if (id === null) {
    return;
  }
  const expirationTime = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  seen.set(id, expirationTime);
  if (++newCount >= STORAGE_UPDATE_BATCH_SIZE) {
    storeSeen();
  }
}

function getId(tweet) {
  const username = getUsername(tweet);
  const analyticsLink = tweet.querySelector(`a[href^="/${username}/status/"][href$="/analytics"]`);
  // for minified tweets
  if (analyticsLink === null) {
    return null;
  }
  const parts = analyticsLink.href.split('/');
  return parts[parts.length - 2];
}

function getUsername(tweet) {
  const usernameHref = tweet.querySelector('[data-testid^="UserAvatar-Container-"]').querySelector('a[href]').href
  return usernameHref.split('/').pop();
}

function storeSeen() {
  localStorage.setItem('seenTweets', JSON.stringify([...seen]));
  newCount = 0;
};

function handleRemoveSeenTweetsBelow() {
  const tweets = getTweets();

  for (let i = 0; i < tweets.length; i++) {
    const bottomThreshold = Math.min(window.scrollY - 100, window.innerHeight + 50);
    const tweet = tweets[i];
    const tweetTop = tweet.getBoundingClientRect().top;
    
    if (tweetTop > bottomThreshold && hasSeen(tweet)) {
      const tweetId = getId(tweet);
      replaceWithPlaceholder(tweet, tweetId);
    }
  }
}

function replaceWithPlaceholder(tweet, tweetId) {
  const placeholder = tweet.cloneNode(true);
  const namePanelParent = placeholder.firstElementChild.firstElementChild.children[1].children[1];
  while (namePanelParent.children.length > 1) {
    namePanelParent.removeChild(namePanelParent.lastChild);
  }
  const namePanel = namePanelParent.firstElementChild.firstElementChild;
  namePanel.removeChild(namePanel.lastChild);
  // Create a container for the "Seen" text and "View" button
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; justify-content: flex-end; align-items: center; width: 100%;';
  
  // Add "Seen" text
  const seenText = document.createElement('span');
  seenText.innerText = 'Seen';
  seenText.style.cssText = 'color: rgb(83, 100, 113); font-size: 13px; margin-right: 8px;';
  container.appendChild(seenText);
  
  // Add View button
  const viewButton = document.createElement('button');
  viewButton.innerHTML = `
    <div dir="ltr" class="css-146c3p1 r-bcqeeo r-qvutc0 r-37j5jr r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-1777fci" style="text-overflow: unset; color: rgb(15, 20, 25);">
      <span class="css-1jxf684 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1b43r93 r-1cwl3u0" style="text-overflow: unset;">
        <span dir="ltr" class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1udh08x" style="text-overflow: unset;">
          <span class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">
            <span class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">View</span>
          </span>
        </span>
      </span>
    </div>
  `;
  viewButton.setAttribute('role', 'button');
  viewButton.className = 'css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-faml9v r-2dysd3 r-15ysp7h r-4wgw6l r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l';
  viewButton.style.cssText = 'border-color: rgba(0, 0, 0, 0); background-color: rgba(0, 0, 0, 0);';
  viewButton.type = 'button';
  viewButton.addEventListener('click', () => {
    placeholder.replaceWith(tweet);
    undoneTweets.add(tweetId);
  });
  container.appendChild(viewButton);
  container.style.width = '25%';

  namePanel.appendChild(container);
  tweet.replaceWith(placeholder);
}

function hasSeen(tweet) {
  const id = getId(tweet);
  if (id === null) {
    return false;
  }
  return !!seen.get(id) && !undoneTweets.has(id);
}

// function isParentTweet(tweet) {
//   // if there are 2+ elements it contains the parent-tweet-side-arrow
//   const profileAndSideArrow = tweet.children[0].children[0].children[1].children[0];
//   return profileAndSideArrow.children.length >= 2;
// }

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
window.addEventListener('blur', storeSeen);
window.addEventListener('focus', loadSeen);
