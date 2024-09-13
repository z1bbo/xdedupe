const STORAGE_UPDATE_BATCH_SIZE = 20;
const DEFAULT_TTL_DAYS = 7;

const seen = new Map();
const undoneTweets = new Set();
let newCount = 0;
let lastScrollTime = 0;
let oldTweets = [];
let lastScrollY = 0;

function handleScroll() {
  const now = Date.now();
  const msSinceLastScroll = now - lastScrollTime;

  if (msSinceLastScroll < 80) {
    return;
  }
  // always remove below seen tweets for all scroll styles
  lastScrollTime = now;
  handleRemoveSeenTweetsBelow();

  const scrollDistance = window.scrollY - lastScrollY;
  if (Math.abs(scrollDistance * 300 / msSinceLastScroll) > window.innerHeight) {
    lastScrollY = window.scrollY;
    return;
  }
  // only mark as seen for not-too-fast/normal scrolling
  handleScrollTweetTransition();
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
    // TODO remove log once finished debugging all pages
    console.log(`weird, cannot get ID: ${JSON.stringify(tweet)}`);
    return;
  }
    // TODO remove log once finished debugging all pages
  console.log("seen ", id);
  const expirationTime = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  seen.set(id, expirationTime);
  if (++newCount >= STORAGE_UPDATE_BATCH_SIZE) {
    storeSeen();
  }
}

function getId(tweet) {
  const username = getUsername(tweet);
  // /analytics for the /home page
  // /history for e.g. the /status page
  // this doesn't work for the top tweet at /${username}/status/{id} - which is great since we probably don't want to hide that
  // TODO false: we do get the id of https://x.com/gdb/status/1834295775674990676
  const statusLink = tweet.querySelector(`a[href^="/${username}/status/"][href$="/analytics"], a[href^="/${username}/status/"][href$="/history"]`);
  if (statusLink === null) {
    return null;
  }
  const parts = statusLink.href.split('/');
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
  // don't hide the top tweet on the /status/{id} page
  var i = window.location.href.match(/^https:\/\/x\.com\/\w+\/status\/\d+$/) ? 1 : 0;
  for (; i < tweets.length; i++) {
    const bottomThreshold = Math.min(window.scrollY - 100, window.innerHeight + 50);
    const tweet = tweets[i];
    const tweetTop = tweet.getBoundingClientRect().top;
    
    const id = getId(tweet);
    if (tweetTop > bottomThreshold && hasSeen(id)) {
      replaceWithPlaceholder(tweet, id);
    }
  }
}

function replaceWithPlaceholder(tweet, tweetId) {
  const placeholder = tweet.cloneNode(true);
  placeholder.removeAttribute('data-testid');
  const faceDiv = placeholder.firstElementChild.firstElementChild.children[1].firstElementChild.firstElementChild;
  faceDiv.style.transformOrigin = 'scale(0.7)';
  faceDiv.style.transformOrigin = 'center';
  
  const namePanelParent = placeholder.firstElementChild.firstElementChild.children[1].children[1];
  while (namePanelParent.children.length > 1) {
    namePanelParent.removeChild(namePanelParent.lastChild);
  }
  const namePanel = namePanelParent.firstElementChild.firstElementChild;
  namePanel.removeChild(namePanel.lastChild);
  const viewButton = document.createElement('span');
  viewButton.style.fontFamily = 'serif';
  viewButton.style.fontSize = 'inherit';
  viewButton.innerHTML = 'View';
  // test: remove display inlineBlock, background-color: transparent;
  viewButton.style.cssText = 'transition: background-color 0.1s ease; cursor: pointer; padding: 10px 10px;';
  viewButton.addEventListener('mouseover', () => {
    viewButton.style.backgroundColor = 'lightgrey';
  });
  viewButton.addEventListener('mouseout', () => {
    viewButton.style.backgroundColor = 'transparent';
  });
  viewButton.addEventListener('click', () => {
    placeholder.replaceWith(tweet);
    undoneTweets.add(tweetId);
  });

  namePanel.appendChild(viewButton);
  tweet.replaceWith(placeholder);
}

function hasSeen(id) {
  if (id === null) {
    return false;
  }
  return !!seen.get(id) && !undoneTweets.has(id);
}

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
window.addEventListener('focus', handleScroll, { passive: true });